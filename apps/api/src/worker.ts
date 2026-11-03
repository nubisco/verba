// The Cloudflare Worker that serves hosted Verba (docs/hosting-on-cloudflare.md).
//
// The same Hono app as the Docker image (app.ts), on Cloudflare's runtime: D1
// for the database, the account's Durable Object for live updates, the rate
// limiting bindings for the sign-in limits, `waitUntil` for work after the
// response, and the built web app from the static assets. Self-hosting on
// Workers is not supported: this entry and apps/api/wrangler.toml describe
// Nubisco's hosted instance. The Node entry is index.ts.

import { PrismaD1 } from '@prisma/adapter-d1'
import pkg from '../package.json' with { type: 'json' }
import { buildApp } from './app.js'
import { setDeferrer } from './defer.js'
import type { Api } from './http.js'
import { setLive } from './live.js'
import { setPrisma } from './prisma.js'
import { bindingRateLimiters } from './rate-limits.js'
import { PrismaClient } from './generated/prisma-worker/client.js'
import type { ExecutionContextLike, WorkerEnv } from './worker/cloudflare.js'
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
      setPrisma(new PrismaClient({ adapter: new PrismaD1(env.DB as never) }) as never)
      setLive(hubLive(env.LIVE))
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
    const api = await appFor(env)
    return api.fetch(new Request(url, request), env, ctx as never)
  },
}
