import { prisma } from '../prisma.js'
import type { ImportMapping } from '../schemas/import.schema.js'

function notFound(): never {
  throw Object.assign(new Error('ImportRun not found'), { statusCode: 404 })
}

export async function createImportRun(projectId: string, userId: string | undefined, mapping: ImportMapping) {
  return prisma.importRun.create({
    data: {
      projectId,
      userId,
      status: 'PENDING',
      mapping: JSON.stringify(mapping),
    },
  })
}

export async function updateImportRun(id: string, status: string, stats: object, errors: object[]) {
  return prisma.importRun.update({
    where: { id },
    data: {
      status,
      stats: JSON.stringify(stats),
      errors: JSON.stringify(errors),
    },
  })
}

export async function listImportRuns(projectId: string) {
  return prisma.importRun.findMany({
    where: { projectId },
    orderBy: { createdAt: 'desc' },
  })
}

export async function getImportRun(projectId: string, id: string) {
  const run = await prisma.importRun.findFirst({ where: { id, projectId } })
  if (!run) notFound()
  return run
}
