import { prisma } from '../prisma.js'

interface LogParams {
  projectId: string
  userId?: string
  action: string
  entityType: string
  entityId: string
  before?: object
  after?: object
}

/**
 * Only what changed. When both sides are objects, a field equal on both sides
 * is dropped from both, so an edit stores the fields it touched and not the
 * whole row twice. The audit log is the largest table, and hosted Verba keeps
 * every account in one D1 database, so this matters (docs/hosting-on-cloudflare.md).
 */
export function changedFields(
  before: object | undefined,
  after: object | undefined,
): { before?: object; after?: object } {
  if (!before || !after) return { before, after }
  const b: Record<string, unknown> = {}
  const a: Record<string, unknown> = {}
  const fields = new Set([...Object.keys(before), ...Object.keys(after)])
  for (const field of fields) {
    const was = (before as Record<string, unknown>)[field]
    const is = (after as Record<string, unknown>)[field]
    if (JSON.stringify(was) === JSON.stringify(is)) continue
    if (was !== undefined) b[field] = was
    if (is !== undefined) a[field] = is
  }
  return { before: b, after: a }
}

function row(params: LogParams) {
  const { before, after } = changedFields(params.before, params.after)
  return {
    projectId: params.projectId,
    userId: params.userId,
    action: params.action,
    entityType: params.entityType,
    entityId: params.entityId,
    before: before !== undefined ? JSON.stringify(before) : undefined,
    after: after !== undefined ? JSON.stringify(after) : undefined,
  }
}

export async function log(params: LogParams): Promise<void> {
  try {
    await prisma.auditLog.create({ data: row(params) })
  } catch {
    // Log failures must not crash the app
  }
}

/** Many entries in a few inserts (an import's text changes). Nine columns, so ten per insert. */
export async function logMany(entries: LogParams[]): Promise<void> {
  try {
    for (let i = 0; i < entries.length; i += 10) {
      await prisma.auditLog.createMany({ data: entries.slice(i, i + 10).map(row) })
    }
  } catch {
    // Log failures must not crash the app
  }
}

export async function listAuditLogs(projectId: string, entityType?: string, page = 1, limit = 50) {
  return prisma.auditLog.findMany({
    where: { projectId, ...(entityType ? { entityType } : {}) },
    orderBy: { createdAt: 'desc' },
    skip: (page - 1) * limit,
    take: limit,
  })
}
