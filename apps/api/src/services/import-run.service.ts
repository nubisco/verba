import { prisma } from '../prisma.js'

function notFound(): never {
  throw Object.assign(new Error('ImportRun not found'), { statusCode: 404 })
}

// Runs are created and closed by the background jobs (import-job.service.ts).

export async function listImportRuns(projectId: string) {
  // AI fills are runs too (import-job.service.ts), but this is the import history.
  return prisma.importRun.findMany({
    where: { projectId, kind: 'import' },
    orderBy: { createdAt: 'desc' },
  })
}

export async function getImportRun(projectId: string, id: string) {
  const run = await prisma.importRun.findFirst({ where: { id, projectId } })
  if (!run) notFound()
  return run
}
