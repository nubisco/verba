import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { cors } from 'hono/cors'
import { ZodError } from 'zod'

import { projectRoutes } from './routes/projects.js'
import { namespaceRoutes } from './routes/namespaces.js'
import { localeRoutes } from './routes/locales.js'
import { keyRoutes } from './routes/keys.js'
import { translationRoutes } from './routes/translations.js'
import { authRoutes } from './routes/auth.js'
import { memberRoutes } from './routes/members.js'
import { auditRoutes } from './routes/audit.js'
import { commentRoutes } from './routes/comments.js'
import { exportRoutes } from './routes/export.js'
import { importRunRoutes } from './routes/import-runs.js'
import { importRoutes } from './routes/import.js'
import { accountRoutes } from './routes/accounts.js'
import { adminRoutes } from './routes/admin.js'
import { notificationRoutes } from './routes/notifications.js'
import { aiRoutes } from './routes/ai.js'
import { setupRoutes } from './routes/setup.js'
import { configRoutes } from './routes/config.js'
import { getAuthConfig, platformOnlyAuth } from './services/instance-config.service.js'
import { billingRoutes } from './routes/billing.js'
import type { Api, AppEnv } from './http.js'
import { guardEveryWrite } from './read-only.js'
// Registers what each background job does (jobs.ts).
import './job-runner.js'
import type { RateLimiterSource } from './rate-limits.js'

/** The largest request body, as Fastify's default bodyLimit had it: 1 MiB. */
export const BODY_LIMIT_BYTES = 1024 * 1024

export interface BuildOptions {
  /**
   * Registers this runtime's project rooms (`/ws/projects/:projectId`). The
   * Node server registers routes/ws.ts with @hono/node-ws (index.ts), a Worker
   * hands the socket to the account's Durable Object (worker/ws.ts). Without
   * it there is no /ws route.
   */
  websocket?: (app: Api) => void
  /** Log each request. On by default, as Fastify's `logger: true` was. */
  logRequests?: boolean
  /** Where the sign-in rate limits count. This process unless given (a Worker's bindings). */
  rateLimiters?: RateLimiterSource
  /** What GET /version reports. The entry point reads it from package.json. */
  version?: { name: string; version: string }
}

export async function buildApp(options: BuildOptions = {}): Promise<Api> {
  if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET must be set in production')
  }
  // Federated sign-in only, with no provider to sign in through, is an
  // instance nobody can enter. Say so at start-up rather than at the login page.
  if (platformOnlyAuth() && !getAuthConfig().platformEnabled && !process.env.OIDC_ISSUER) {
    throw new Error('VERBA_AUTH_MODE=platform needs PLATFORM_ISSUER and PLATFORM_APP_ID (or OIDC_ISSUER)')
  }

  const app = new Hono<AppEnv>()
  // An account over its hosted plan is read-only: every write route
  // registered below gets the write guard. It does nothing without hosted plans.
  guardEveryWrite(app)

  if (options.logRequests ?? process.env.NODE_ENV !== 'test') {
    // One JSON line per request, as Fastify's logger wrote them, so the
    // container's log reads the same and stays machine-readable.
    app.use(async (c, next) => {
      const started = performance.now()
      await next()
      console.log(
        JSON.stringify({
          time: Date.now(),
          msg: 'request completed',
          method: c.req.method,
          url: c.req.path,
          statusCode: c.res.status,
          responseTime: Math.round((performance.now() - started) * 10) / 10,
        }),
      )
    })
  }

  const isDev = process.env.NODE_ENV !== 'production'
  const corsOrigin = process.env.CORS_ORIGIN
  // In dev, allow any localhost origin (Vite may use a fallback port).
  // In production, CORS_ORIGIN must be set explicitly, and without it no
  // cross-origin request is allowed.
  if (isDev || corsOrigin) {
    app.use(
      cors({
        origin: isDev ? (origin) => (origin.startsWith('http://localhost') ? origin : null) : corsOrigin!,
        credentials: true,
        allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      }),
    )
  }

  // Uploads are limited per file instead (routes/import.ts). No other route
  // reads a multipart body (readBody in http.ts ignores one).
  const limitBody = bodyLimit({
    maxSize: BODY_LIMIT_BYTES,
    onError: (c) => c.json({ error: 'Request body is too large' }, 413),
  })
  app.use(async (c, next) => {
    if ((c.req.header('content-type') ?? '').startsWith('multipart/form-data')) return next()
    return limitBody(c, next)
  })

  app.onError((err, c) => {
    if (err instanceof ZodError) {
      return c.json({ error: 'Validation error', issues: err.issues }, 400)
    }
    const e = err as { statusCode?: number; message?: string; details?: Record<string, unknown> }
    const statusCode = e.statusCode ?? 500
    if (statusCode >= 500) console.error(err)
    // `details` carries what a caller needs to recover, such as the accounts
    // to choose from when a request did not name one (account.service.ts).
    return c.json({ error: e.message ?? 'Internal Server Error', ...(e.details ?? {}) }, statusCode as 500)
  })

  // The same body Fastify answered an unknown route with.
  app.notFound((c) =>
    c.json({ message: `Route ${c.req.method}:${c.req.path} not found`, error: 'Not Found', statusCode: 404 }, 404),
  )

  app.get('/health', (c) => c.json({ status: 'ok' }))

  app.get('/version', (c) =>
    c.json({
      name: options.version?.name ?? '@nubisco/verba-api',
      version: options.version?.version ?? null,
      commit: process.env.VERBA_GIT_SHA ?? null,
      environment: process.env.NODE_ENV ?? null,
    }),
  )

  authRoutes(app, options.rateLimiters)
  memberRoutes(app)
  projectRoutes(app)
  namespaceRoutes(app)
  localeRoutes(app)
  keyRoutes(app)
  translationRoutes(app)
  auditRoutes(app)
  commentRoutes(app)
  exportRoutes(app)
  importRunRoutes(app)
  importRoutes(app)
  accountRoutes(app)
  options.websocket?.(app)
  adminRoutes(app)
  notificationRoutes(app)
  aiRoutes(app)
  setupRoutes(app)
  configRoutes(app)
  await billingRoutes(app)

  return app
}
