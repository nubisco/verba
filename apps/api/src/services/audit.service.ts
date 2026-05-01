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

export async function log(params: LogParams): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        projectId: params.projectId,
        userId: params.userId,
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId,
        before: params.before !== undefined ? JSON.stringify(params.before) : undefined,
        after: params.after !== undefined ? JSON.stringify(params.after) : undefined,
      },
    })
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
