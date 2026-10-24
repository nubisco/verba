import 'dotenv/config'
import { readFileSync } from 'node:fs'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import cookie from '@fastify/cookie'
import jwt from '@fastify/jwt'
import multipart from '@fastify/multipart'
import websocket from '@fastify/websocket'
import rateLimit from '@fastify/rate-limit'
import { ZodError } from 'zod'

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf-8')) as {
  name: string
  version: string
}
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
import { wsRoutes } from './routes/ws.js'
import { adminRoutes } from './routes/admin.js'
import { notificationRoutes } from './routes/notifications.js'
import { aiRoutes } from './routes/ai.js'
import { setupRoutes } from './routes/setup.js'
import { configRoutes } from './routes/config.js'
import { trustProxySetting } from './rate-limits.js'
import { SESSION_COOKIE, makeAuthenticate, sessionTtlSeconds } from './session.js'

export function buildApp() {
  if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET must be set in production')
  }

  const app = Fastify({ logger: true, trustProxy: trustProxySetting() })

  const isDev = process.env.NODE_ENV !== 'production'
  app.register(cors, {
    // In dev, allow any localhost origin (Vite may use a fallback port).
    // In production, CORS_ORIGIN must be set explicitly.
    origin: isDev
      ? (origin, cb) => cb(null, !origin || origin.startsWith('http://localhost'))
      : process.env.CORS_ORIGIN || false,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  })

  app.register(cookie)
  // Off by default: only the routes that name a limit get one (see rate-limits.ts).
  app.register(rateLimit, { global: false })
  app.register(multipart)
  app.register(websocket)
  app.register(jwt, {
    secret: process.env.JWT_SECRET || 'dev-secret',
    cookie: { cookieName: SESSION_COOKIE, signed: false },
    // Applies to every verify, the WebSocket's included. maxAge also retires
    // sessions signed before they carried an expiry.
    verify: { maxAge: sessionTtlSeconds() },
  })

  app.decorate('authenticate', makeAuthenticate(app))

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof ZodError) {
      return reply.status(400).send({ error: 'Validation error', issues: err.issues })
    }
    const e = err as { statusCode?: number; message?: string; details?: Record<string, unknown> }
    const statusCode = e.statusCode ?? 500
    // `details` carries what a caller needs to recover, such as the accounts
    // to choose from when a request did not name one (account.service.ts).
    return reply.status(statusCode).send({ error: e.message ?? 'Internal Server Error', ...(e.details ?? {}) })
  })

  app.get('/health', async () => ({ status: 'ok' }))

  app.get('/version', async () => ({
    name: pkg.name,
    version: pkg.version,
    commit: process.env.VERBA_GIT_SHA ?? null,
    environment: process.env.NODE_ENV ?? null,
  }))

  app.register(authRoutes)
  app.register(memberRoutes)
  app.register(projectRoutes)
  app.register(namespaceRoutes)
  app.register(localeRoutes)
  app.register(keyRoutes)
  app.register(translationRoutes)
  app.register(auditRoutes)
  app.register(commentRoutes)
  app.register(exportRoutes)
  app.register(importRunRoutes)
  app.register(importRoutes)
  app.register(accountRoutes)
  app.register(wsRoutes)
  app.register(adminRoutes)
  app.register(notificationRoutes)
  app.register(aiRoutes)
  app.register(setupRoutes)
  app.register(configRoutes)

  return app
}
