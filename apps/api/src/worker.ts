// The Cloudflare Worker that serves hosted Verba (docs/hosting-on-cloudflare.md).
//
// The same Hono app as the Docker image (app.ts), on Cloudflare's runtime: D1
// for the database, the account's Durable Object for live updates, the rate
// limiting bindings for the sign-in limits, `waitUntil` for work after the
// response, a Queue for background jobs (imports and AI fills, in chunks), a
// cron trigger for the hourly housekeeping, and the built web app from the
// static assets. Self-hosting on
// Workers is not supported: this entry and apps/api/wrangler.toml describe
// Nubisco's hosted instance. The Node entry is index.ts.

import { PrismaD1 } from '@prisma/adapter-d1'
import pkg from '../package.json' with { type: 'json' }
import { buildApp } from './app.js'
import { setDeferrer } from './defer.js'
import { runJob, setJobQueue, type Job } from './jobs.js'
import { maintenanceTick } from './services/maintenance.service.js'
import type { Api } from './http.js'
import { setLive } from './live.js'
import { setPrisma } from './prisma.js'
import { bindingRateLimiters } from './rate-limits.js'
import { PrismaClient } from './generated/prisma-worker/client.js'
import type { ExecutionContextLike, MessageBatchLike, WorkerEnv } from './worker/cloudflare.js'
import { countingD1, d1SizeBytes, withQueryBudget } from './worker/d1-budget.js'
import { hubLive } from './worker/live.js'
import { workerWsRoutes } from './worker/ws.js'

/** Durable Object classes are exported by the Worker's main module. */
export { LiveHub } from './worker/live-hub.js'

/** The API lives under /api, as nginx serves it in the Docker setup. */
const API_PREFIX = '/api'

let app: Promise<Api> | null = null

/**
 * The app, built once per isolate. The services read their settings from
 * process.env, as on Node, so the Worker's vars and secrets are copied there
 * first. Bindings (D1, the hub, the limiters) are the same objects for the
 * life of the isolate.
 */
function appFor(env: WorkerEnv): Promise<Api> {
  if (!app) {
    app = (async () => {
      for (const [name, value] of Object.entries(env)) {
        if (typeof value === 'string' && process.env[name] === undefined) process.env[name] = value
      }
      // The workerd client has the same models as the Node one: only how it
      // loads its query compiler differs.
      setPrisma(new PrismaClient({ adapter: new PrismaD1(countingD1(env.DB) as never) }) as never)
      setLive(hubLive(env.LIVE))
      // A Queue message holds one job. sendBatch takes up to 100 at a time.
      setJobQueue({
        async send(jobs) {
          for (let i = 0; i < jobs.length; i += 100) {
            await env.JOBS.sendBatch(jobs.slice(i, i + 100).map((body) => ({ body })))
          }
        },
      })
      return buildApp({
        websocket: workerWsRoutes,
        rateLimiters: bindingRateLimiters(env),
        version: { name: pkg.name, version: pkg.version },
      })
    })()
    // A failed start is retried by the next request rather than kept.
    app.catch(() => (app = null))
  }
  return app
}

export default {
  async fetch(request: Request, env: WorkerEnv, ctx: ExecutionContextLike): Promise<Response> {
    setDeferrer((work) => ctx.waitUntil(work))
    const url = new URL(request.url)
    if (url.pathname !== API_PREFIX && !url.pathname.startsWith(`${API_PREFIX}/`)) {
      // wrangler.toml sends only /api/* here, so this is a fallback.
      return env.ASSETS.fetch(request)
    }
    url.pathname = url.pathname.slice(API_PREFIX.length) || '/'
    return withQueryBudget(`${request.method} ${url.pathname}`, async () => {
      const api = await appFor(env)
      return api.fetch(new Request(url, request), env, ctx as never)
    })
  },

  /**
   * The background jobs (jobs.ts). wrangler.toml hands the consumer one
   * message at a time, so each job is its own invocation with its own D1
   * query budget. A job that throws is retried by the Queue. The import and
   * AI jobs catch their own failures and record them on the run, so a retry
   * only happens when the database itself could not be reached.
   */
  async queue(batch: MessageBatchLike<Job>, env: WorkerEnv, ctx: ExecutionContextLike): Promise<void> {
    setDeferrer((work) => ctx.waitUntil(work))
    await appFor(env)
    for (const message of batch.messages) {
      try {
        await withQueryBudget(`job ${message.body.kind}`, () => runJob(message.body))
        message.ack()
      } catch (err) {
        console.error(`[jobs] ${message.body.kind} failed, retrying:`, err)
        message.retry()
      }
    }
  },

  /** The hourly cron (wrangler.toml [triggers]): retention, cleanup, the size alert. */
  async scheduled(_event: unknown, env: WorkerEnv, ctx: ExecutionContextLike): Promise<void> {
    setDeferrer((work) => ctx.waitUntil(work))
    await appFor(env)
    const report = await withQueryBudget('cron', () => maintenanceTick({ sizeBytes: () => d1SizeBytes(env.DB) }))
    console.log(JSON.stringify({ msg: 'maintenance', ...report }))
  },
}
