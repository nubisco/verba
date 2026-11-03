// Background jobs: long work (imports, AI fills) done in chunks, one chunk per
// job, so no single request or invocation does too much.
//
// On Cloudflare a Worker invocation may run about 1,000 D1 queries, so an
// import of thousands of rows cannot run inside the request that uploads it.
// The request stores the rows as chunks (ImportChunk) and enqueues one job per
// chunk. On a Worker the jobs go to a Cloudflare Queue whose consumer runs one
// message per invocation (worker.ts). On Node they run in this process, one
// after another, so a self-hosted instance needs no queue service.

export type Job = { kind: 'import.chunk'; chunkId: string } | { kind: 'ai.fill.chunk'; chunkId: string }

export interface JobQueue {
  send(jobs: Job[]): Promise<void>
}

type Runner = (job: Job) => Promise<void>

let runner: Runner = async () => {
  throw new Error('No job runner is registered (jobs.ts)')
}

/** What runs a job. Set once by the module that owns the job kinds (job-runner.ts). */
export function setJobRunner(next: Runner): void {
  runner = next
}

/** Run one job now. The Queue consumer and the in-process queue both call this. */
export function runJob(job: Job): Promise<void> {
  return runner(job)
}

/**
 * The in-process queue: jobs run one at a time, in order, after the current
 * request. A failing job is logged and the next one runs.
 */
export function inProcessQueue(): JobQueue & { idle(): Promise<void> } {
  const pending: Job[] = []
  let draining: Promise<void> | null = null
  const drain = async () => {
    while (pending.length > 0) {
      const job = pending.shift()!
      try {
        await runJob(job)
      } catch (err) {
        console.error(`[jobs] ${job.kind} ${job.chunkId} failed:`, err)
      }
    }
    draining = null
  }
  return {
    async send(jobs) {
      pending.push(...jobs)
      draining ??= new Promise<void>((resolve) => setTimeout(resolve, 0)).then(drain)
    },
    /** Resolves when every job sent so far has run (tests and shutdown). */
    async idle() {
      while (draining) await draining
    },
  }
}

let queue: JobQueue = inProcessQueue()

/** Where jobs go. In-process unless an entry point set a Queue (worker.ts). */
export function setJobQueue(next: JobQueue): void {
  queue = next
}

export function jobQueue(): JobQueue {
  return queue
}

/** Send jobs to whichever queue is set. */
export function enqueue(jobs: Job[]): Promise<void> {
  return jobs.length === 0 ? Promise.resolve() : queue.send(jobs)
}
