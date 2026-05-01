import 'dotenv/config'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import cookie from '@fastify/cookie'
import jwt from '@fastify/jwt'
import multipart from '@fastify/multipart'
import websocket from '@fastify/websocket'
import { ZodError } from 'zod'
import type { FastifyRequest, FastifyReply } from 'fastify'
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
import { orgRoutes } from './routes/orgs.js'
import { wsRoutes } from './routes/ws.js'
import { adminRoutes } from './routes/admin.js'
import { notificationRoutes } from './routes/notifications.js'
import { aiRoutes } from './routes/ai.js'
import { setupRoutes } from './routes/setup.js'
import { configRoutes } from './routes/config.js'

export function buildApp() {
  if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET must be set in production')
  }

  const app = Fastify({ logger: true })

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
  app.register(multipart)
  app.register(websocket)
  app.register(jwt, {
    secret: process.env.JWT_SECRET || 'dev-secret',
    cookie: { cookieName: 'token', signed: false },
  })

  app.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify()
    } catch (_err) {
      return reply.status(401).send({ error: 'Unauthorized' })
    }
  })

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof ZodError) {
      return reply.status(400).send({ error: 'Validation error', issues: err.issues })
    }
    const e = err as { statusCode?: number; message?: string }
    const statusCode = e.statusCode ?? 500
    return reply.status(statusCode).send({ error: e.message ?? 'Internal Server Error' })
  })

  app.get('/health', async () => ({ status: 'ok' }))

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
  app.register(orgRoutes)
  app.register(wsRoutes)
  app.register(adminRoutes)
  app.register(notificationRoutes)
  app.register(aiRoutes)
  app.register(setupRoutes)
  app.register(configRoutes)

  return app
}
