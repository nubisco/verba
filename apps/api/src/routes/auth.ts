import type { FastifyInstance } from 'fastify'
import { RegisterSchema, LoginSchema, OtpRequestSchema, OtpVerifySchema } from '../schemas/auth.schema.js'
import * as authService from '../services/auth.service.js'
import * as otpService from '../services/otp.service.js'
import * as platformAuthService from '../services/platform-auth.service.js'
import { prisma } from '../prisma.js'
import { getAuthConfig } from '../services/instance-config.service.js'

export async function authRoutes(app: FastifyInstance) {
  app.post('/auth/register', async (req, reply) => {
    const authConfig = getAuthConfig()
    if (!authConfig.localPasswordEnabled) {
      return reply.status(404).send({ error: 'Password registration is disabled for this instance' })
    }
    const body = RegisterSchema.parse(req.body)
    const user = await authService.register(body.email, body.password)
    const token = app.jwt.sign({ userId: user.id, email: user.email })
    reply.setCookie('token', token, { httpOnly: true, path: '/' })
    return reply.status(201).send({ id: user.id, email: user.email })
  })

  app.post('/auth/login', async (req, reply) => {
    const authConfig = getAuthConfig()
    if (!authConfig.localPasswordEnabled) {
      return reply.status(404).send({ error: 'Password login is disabled for this instance' })
    }
    const body = LoginSchema.parse(req.body)
    const payload = await authService.login(body.email, body.password)
    const token = app.jwt.sign({ userId: payload.userId, email: payload.email })
    reply.setCookie('token', token, { httpOnly: true, path: '/' })
    return reply.send({ id: payload.userId, email: payload.email })
  })

  app.post('/auth/logout', async (_req, reply) => {
    reply.clearCookie('token', { path: '/' })
    return reply.send({ ok: true })
  })

  app.get('/auth/me', { preHandler: [app.authenticate] }, async (req) => {
    return authService.getMe(req.user.userId)
  })

  app.get('/auth/me/tasks', { preHandler: [app.authenticate] }, async (req) => {
    const userId = req.user.userId
    return prisma.translation.findMany({
      where: {
        updatedById: userId,
        status: { in: ['IN_PROGRESS', 'SUBMITTED'] },
      },
      include: {
        key: { include: { project: { select: { id: true, name: true } } } },
        locale: { select: { code: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 50,
    })
  })

  app.patch('/auth/me', { preHandler: [app.authenticate] }, async (req) => {
    const body = req.body as {
      email?: string
      name?: string
      currentPassword?: string
      newPassword?: string
      preferredLocales?: string[]
    }
    return authService.updateProfile(req.user.userId, body)
  })

  app.post('/auth/me/deactivate', { preHandler: [app.authenticate] }, async (req, reply) => {
    await authService.deactivateUser(req.user.userId, req.user.userId)
    reply.clearCookie('token', { path: '/' })
    return reply.send({ ok: true })
  })

  // OTP routes
  app.post<{ Body: { email: string } }>('/auth/otp/request', async (req, reply) => {
    const authConfig = getAuthConfig()
    if (!authConfig.localOtpEnabled) {
      return reply.status(404).send({ error: 'OTP login is disabled for this instance' })
    }
    const { email } = OtpRequestSchema.parse(req.body)
    await otpService.requestOtp(email.toLowerCase().trim())
    return reply.send({ ok: true })
  })

  app.post<{ Body: { email: string; code: string } }>('/auth/otp/verify', async (req, reply) => {
    const authConfig = getAuthConfig()
    if (!authConfig.localOtpEnabled) {
      return reply.status(404).send({ error: 'OTP login is disabled for this instance' })
    }
    const { email, code } = OtpVerifySchema.parse(req.body)
    const payload = await otpService.verifyOtp(email.toLowerCase().trim(), code.trim())
    const token = app.jwt.sign({
      userId: payload.userId,
      email: payload.email,
    })
    reply.setCookie('token', token, { httpOnly: true, path: '/' })
    return reply.send({ id: payload.userId, email: payload.email })
  })

  // Platform auth callback: validates a Nubisco Platform JWT and issues a local verba session.
  // Only active when PLATFORM_ISSUER env var is set.
  app.post<{ Body: { token: string } }>('/auth/platform/callback', async (req, reply) => {
    if (!platformAuthService.isPlatformAuthEnabled()) {
      return reply.status(404).send({ error: 'Platform auth is not configured' })
    }
    const { token } = req.body ?? {}
    if (!token || typeof token !== 'string') {
      return reply.status(400).send({ error: 'token is required' })
    }
    const payload = await platformAuthService.verifyPlatformToken(token)
    if (!payload) {
      return reply.status(401).send({ error: 'Invalid or expired platform token' })
    }
    const localToken = app.jwt.sign({ userId: payload.userId, email: payload.email })
    reply.setCookie('token', localToken, { httpOnly: true, path: '/' })
    return reply.send({ id: payload.userId, email: payload.email })
  })

  // Returns whether platform auth is configured: used by the frontend to show the platform login button
  app.get('/auth/platform/config', async () => ({
    enabled: platformAuthService.isPlatformAuthEnabled(),
    issuer: process.env.PLATFORM_ISSUER ?? null,
  }))

  // User lookup by email: used by the member management UI
  app.get<{ Querystring: { email?: string } }>('/users', { preHandler: [app.authenticate] }, async (req) => {
    const { email } = req.query
    if (!email) return []
    const users = await prisma.user.findMany({
      where: { email: { contains: email } },
      select: { id: true, email: true },
      take: 10,
    })
    return users
  })
}
