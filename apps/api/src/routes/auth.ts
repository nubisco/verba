import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { RegisterSchema, LoginSchema, OtpRequestSchema, OtpVerifySchema } from '../schemas/auth.schema.js'
import * as authService from '../services/auth.service.js'
import * as otpService from '../services/otp.service.js'
import * as platformAuthService from '../services/platform-auth.service.js'
import * as bundleService from '../services/identity-bundle.service.js'
import * as analytics from '../services/analytics.service.js'
import * as ssoService from '../services/sso.service.js'
import { prisma } from '../prisma.js'
import { getAuthConfig } from '../services/instance-config.service.js'
import { randomBytes } from 'node:crypto'

function readBundleKey(req: FastifyRequest): string | undefined {
  const raw = req.cookies?.[bundleService.BUNDLE_COOKIE]
  return typeof raw === 'string' && raw.length > 0 ? raw : undefined
}

// Short-lived cookies that carry a sign-in across the trip to the provider.
// httpOnly because the browser must hold them but the page must never read
// them: the PKCE verifier is what proves an intercepted code belongs to this
// browser, and it is worth nothing once script can reach it.
const SSO_STATE_COOKIE = 'verba_sso_state'
const SSO_HANDSHAKE_COOKIE = 'verba_oidc_handshake'
const SSO_LANDING_COOKIE = 'verba_sso_landing'
const SSO_COOKIE_TTL_SECONDS = 600

function ssoCookieOptions() {
  return {
    httpOnly: true,
    path: '/',
    // Lax, not Strict: the provider returns the browser here by a top-level
    // navigation from its own origin, and Strict would withhold the cookie on
    // exactly that request, failing every sign-in with a state mismatch.
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    maxAge: SSO_COOKIE_TTL_SECONDS,
  }
}

function clearSsoCookies(reply: FastifyReply): void {
  for (const name of [SSO_STATE_COOKIE, SSO_HANDSHAKE_COOKIE, SSO_LANDING_COOKIE]) {
    reply.clearCookie(name, { path: '/' })
  }
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

  // ── Federated sign-in ──────────────────────────────────────────────────────
  //
  // Both legs run here. The browser is handed to the provider and comes back
  // with a code (OIDC) or a token (Platform handover); neither reaches the
  // page, and the session cookie is already set by the time the SPA loads.

  app.get('/auth/sso/start', async (req, reply) => {
    const runtime = await ssoService.getSsoRuntime()
    if (!runtime) return reply.status(404).send({ error: 'Single sign-on is not configured on this instance' })

    const redirectUri = ssoService.ssoCallbackUrl()
    const landing = (req.query as { redirect?: unknown })?.redirect
    if (typeof landing === 'string') {
      reply.setCookie(SSO_LANDING_COOKIE, landing, ssoCookieOptions())
    }

    if (runtime.mode === 'oidc') {
      let authorize: { url: string; handshake: unknown }
      try {
        authorize = await runtime.client.authorizeUrl(redirectUri)
      } catch (err) {
        // Discovery is a network call to someone else's server, so it fails in
        // ways a sign-in page cannot act on. Log the reason and send the
        // person somewhere that says so.
        req.log.error({ err }, 'oidc discovery failed')
        return reply.redirect(ssoService.loginErrorUrl('sso_discovery'))
      }
      reply.setCookie(SSO_HANDSHAKE_COOKIE, JSON.stringify(authorize.handshake), ssoCookieOptions())
      return reply.redirect(authorize.url)
    }

    const state = randomBytes(16).toString('hex')
    reply.setCookie(SSO_STATE_COOKIE, state, ssoCookieOptions())
    const ee = await import('@nubisco/verba-ee')
    return reply.redirect(
      ee.handoverAuthorizeUrl(runtime.config, redirectUri, state, {
        loginHint: ssoService.loginHintOf(req),
        prompt: (req.query as { prompt?: string })?.prompt,
      }),
    )
  })

  app.get('/auth/sso/callback', async (req, reply) => {
    const runtime = await ssoService.getSsoRuntime()
    if (!runtime) return reply.status(404).send({ error: 'Single sign-on is not configured on this instance' })

    const query = req.query as Record<string, string | undefined>
    const landing = ssoService.safeLandingUrl(req.cookies?.[SSO_LANDING_COOKIE])

    if (query.error) {
      clearSsoCookies(reply)
      return reply.redirect(ssoService.loginErrorUrl(query.error))
    }

    let claims: { sub: string; email: string; name?: string; app_plan?: string }
    if (runtime.mode === 'oidc') {
      const raw = req.cookies?.[SSO_HANDSHAKE_COOKIE]
      if (!raw || !query.code || !query.state) {
        clearSsoCookies(reply)
        return reply.redirect(ssoService.loginErrorUrl('sso_state'))
      }
      let handshake: { state: string; nonce: string; verifier: string }
      try {
        handshake = JSON.parse(raw)
      } catch {
        clearSsoCookies(reply)
        return reply.redirect(ssoService.loginErrorUrl('sso_state'))
      }
      if (query.state !== handshake.state) {
        clearSsoCookies(reply)
        return reply.redirect(ssoService.loginErrorUrl('sso_state'))
      }
      try {
        claims = await runtime.client.exchange(query.code, ssoService.ssoCallbackUrl(), handshake)
      } catch (err) {
        // The reason never reaches the browser: telling an attacker which half
        // of a check failed is telling them how to pass it. It does reach the
        // log, because without it an SSO outage is indistinguishable from a
        // wrong code, and an exchange fails identically from here for a wrong
        // secret, an unregistered redirect_uri, a rotated key or a replay.
        req.log.error({ err }, 'oidc exchange failed')
        clearSsoCookies(reply)
        return reply.redirect(ssoService.loginErrorUrl('sso_token'))
      }
    } else {
      const expectedState = req.cookies?.[SSO_STATE_COOKIE]
      if (!query.token || !query.state || !expectedState || query.state !== expectedState) {
        clearSsoCookies(reply)
        return reply.redirect(ssoService.loginErrorUrl('sso_state'))
      }
      try {
        claims = await runtime.verifier.verify(query.token)
      } catch (err) {
        req.log.error({ err }, 'sso token verification failed')
        clearSsoCookies(reply)
        return reply.redirect(ssoService.loginErrorUrl('sso_token'))
      }
    }

    clearSsoCookies(reply)

    const identity = await platformAuthService.upsertUserFromClaims(claims, {
      autoProvision: runtime.config.autoProvision,
    })
    // Deactivated locally, or unknown on an instance that does not provision.
    // One answer for both on purpose: which of the two it is tells an outsider
    // whether an address has an account here.
    if (!identity) return reply.redirect(ssoService.loginErrorUrl('not_a_member'))

    let bundleKey = readBundleKey(req)
    if (!bundleKey) {
      bundleKey = bundleService.newBundleKey()
      setBundleKeyCookie(reply, bundleKey)
    }
    await bundleService.upsertActiveIdentity(bundleKey, {
      platformSub: identity.platformSub,
      email: identity.email,
      name: identity.name,
    })

    const localToken = app.jwt.sign({
      userId: identity.userId,
      email: identity.email,
      plan: identity.plan,
      platformSub: identity.platformSub,
    })
    reply.setCookie('token', localToken, { httpOnly: true, path: '/' })

    if (identity.created) {
      analytics.track('app_first_opened', { userId: identity.userId, props: { plan: identity.plan } })
    }
    analytics.track('app_session_started', {
      userId: identity.userId,
      props: { plan: identity.plan, source: `sso_${runtime.mode}` },
    })

    return reply.redirect(landing)
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
