// What each background job does (jobs.ts). Imported by app.ts, so every
// runtime that builds the app can run jobs: the Node process in-line, and the
// Worker's Queue consumer.

import { setJobRunner, type Job } from './jobs.js'
import { prisma } from './prisma.js'
import { fillKeys, type FillPlan } from './services/ai-translation.service.js'
import { finishChunk, runImportChunk } from './services/import-job.service.js'

/** What an AI fill chunk stores: the plan, minus the keys, and its share of them. */
export interface AiFillChunk {
  plan: Omit<FillPlan, 'keyIds'>
  keyIds: string[]
  role: string
}

async function runAiFillChunk(chunkId: string): Promise<void> {
  const chunk = await prisma.importChunk.findUnique({ where: { id: chunkId }, include: { run: true } })
  if (!chunk || chunk.status !== 'PENDING') return
  const { plan, keyIds, role } = JSON.parse(chunk.payload) as AiFillChunk
  const { projectId, userId } = chunk.run
  try {
    const { filled, skipped, warnings } = await fillKeys(projectId, plan, keyIds, userId ?? '', role)
    await finishChunk(chunk.id, chunk.importRunId, projectId, keyIds.length, 'DONE', { filled, skipped }, warnings)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await finishChunk(chunk.id, chunk.importRunId, projectId, keyIds.length, 'FAILED', {}, [{ key: '', message }])
  }
}

export async function runJobNow(job: Job): Promise<void> {
  if (job.kind === 'import.chunk') return runImportChunk(job.chunkId)
  if (job.kind === 'ai.fill.chunk') return runAiFillChunk(job.chunkId)
  throw new Error(`Unknown job ${(job as { kind: string }).kind}`)
}

setJobRunner(runJobNow)
