import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { RegisterSchema, LoginSchema, OtpRequestSchema, OtpVerifySchema } from '../schemas/auth.schema.js'
import * as authService from '../services/auth.service.js'
import * as otpService from '../services/otp.service.js'
import * as platformAuthService from '../services/platform-auth.service.js'
import * as bundleService from '../services/identity-bundle.service.js'
import * as analytics from '../services/analytics.service.js'
import { prisma } from '../prisma.js'
import { getAuthConfig } from '../services/instance-config.service.js'

function readBundleKey(req: FastifyRequest): string | undefined {
  const raw = req.cookies?.[bundleService.BUNDLE_COOKIE]
  return typeof raw === 'string' && raw.length > 0 ? raw : undefined
}

function setBundleKeyCookie(reply: FastifyReply, key: string): void {
  reply.setCookie(bundleService.BUNDLE_COOKIE, key, {
    httpOnly: true,
    path: '/',
    sameSite: 'lax',
    maxAge: bundleService.BUNDLE_TTL_DAYS * 24 * 60 * 60,
  })
}

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
    const me = await authService.getMe(req.user.userId)
    // The platform subject this session was issued for (multi-account
    // sessions): lets the account switcher mark the current identity by sub.
    return { ...me, platformSub: req.user.platformSub ?? null }
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

    // Append this identity to the browser's bundle (or create a new one) so
    // the user can later switch back without re-OTPing on platform. The bundle
    // cookie is independent of the local session token cookie: it survives
    // sign-out of an individual identity.
    let bundleKey = readBundleKey(req)
    if (!bundleKey) {
      bundleKey = bundleService.newBundleKey()
      setBundleKeyCookie(reply, bundleKey)
    }
    await bundleService.upsertActiveIdentity(bundleKey, {
      platformSub: payload.platformSub,
      email: payload.email,
      name: payload.name,
    })

    const localToken = app.jwt.sign({
      userId: payload.userId,
      email: payload.email,
      plan: payload.plan,
      platformSub: payload.platformSub,
    })
    reply.setCookie('token', localToken, { httpOnly: true, path: '/' })

    if (payload.created) {
      analytics.track('app_first_opened', {
        userId: payload.userId,
        props: { plan: payload.plan },
      })
    }
    analytics.track('app_session_started', {
      userId: payload.userId,
      props: { plan: payload.plan, source: 'platform_oidc' },
    })

    return reply.send({
      id: payload.userId,
      email: payload.email,
      plan: payload.plan,
      platformSub: payload.platformSub,
    })
  })

  // List identities active in this browser's bundle. The frontend uses this
  // to render the account-switcher dropdown. No auth required: the bundle
  // cookie itself is the credential.
  app.get('/auth/identities', async (req) => {
    const bundleKey = readBundleKey(req)
    if (!bundleKey) return { identities: [] }
    const identities = await bundleService.listIdentities(bundleKey)
    return {
      identities: identities.map((i) => ({
        platform_sub: i.platformSub,
        email: i.email,
        name: i.name,
        is_active: i.isActive,
        last_used_at: i.lastUsedAt.toISOString(),
      })),
    }
  })

  // Build the OIDC authorize URL the frontend should redirect to in order to
  // switch to a known identity. Verba does not store platform refresh tokens,
  // so switching always requires a round-trip to platform; but platform will
  // recognize the identity from its multi-identity session cookie and silently
  // mint a code (no OTP prompt) when login_hint matches.
  //
  // The frontend posts { platform_sub } and follows the returned URL.
  app.post<{ Body: { platform_sub?: string } }>('/auth/switch', async (req, reply) => {
    const bundleKey = readBundleKey(req)
    if (!bundleKey) {
      return reply.status(400).send({ error: 'No identity bundle on this browser' })
    }
    const platformSub = req.body?.platform_sub
    if (!platformSub) {
      return reply.status(400).send({ error: 'platform_sub is required' })
    }
    const identity = await bundleService.findIdentity(bundleKey, platformSub)
    if (!identity) {
      return reply.status(404).send({ error: 'Identity not found in this bundle' })
    }
    const issuer = process.env.PLATFORM_ISSUER
    if (!issuer) return reply.status(404).send({ error: 'Platform auth not configured' })

    // Return the email; the frontend (which owns its origin and crypto for
    // OIDC state) builds the actual /api/auth/authorize URL with login_hint.
    return reply.send({ email: identity.email })
  })

  // Drop an identity from this browser's bundle. If the dropped identity was
  // the active one, the local session cookie is also cleared so the next
  // request triggers a re-login. Other identities in the bundle stay intact.
  app.post<{ Body: { platform_sub?: string } }>('/auth/identities/remove', async (req, reply) => {
    const bundleKey = readBundleKey(req)
    if (!bundleKey) return { remaining: [] }
    const platformSub = req.body?.platform_sub
    if (!platformSub) {
      return reply.status(400).send({ error: 'platform_sub is required' })
    }
    const identity = await bundleService.findIdentity(bundleKey, platformSub)
    if (identity?.isActive) {
      reply.clearCookie('token', { path: '/' })
    }
    const { remaining } = await bundleService.removeIdentity(bundleKey, platformSub)
    return {
      remaining: remaining.map((i) => ({
        platform_sub: i.platformSub,
        email: i.email,
        name: i.name,
        is_active: i.isActive,
      })),
    }
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
