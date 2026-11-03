import { getCookie, setCookie } from 'hono/cookie'
import type { Api, Ctx } from '../http.js'
import { readBody } from '../http.js'
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
import { authRateLimits } from '../rate-limits.js'
import {
  authenticate,
  clearCookie,
  clearSession,
  cookieMaxAge,
  credentialCookieOptions,
  startSession,
} from '../session.js'

function readBundleKey(c: Ctx): string | undefined {
  const raw = getCookie(c, bundleService.BUNDLE_COOKIE)
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
    sameSite: 'Lax' as const,
    secure: credentialCookieOptions().secure,
    maxAge: SSO_COOKIE_TTL_SECONDS,
  }
}

function clearSsoCookies(c: Ctx): void {
  for (const name of [SSO_STATE_COOKIE, SSO_HANDSHAKE_COOKIE, SSO_LANDING_COOKIE]) {
    clearCookie(c, name)
  }
}

function setBundleKeyCookie(c: Ctx, key: string): void {
  setCookie(c, bundleService.BUNDLE_COOKIE, key, {
    ...credentialCookieOptions(),
    maxAge: cookieMaxAge(bundleService.BUNDLE_TTL_DAYS * 24 * 60 * 60),
  })
}

export function authRoutes(app: Api) {
  const limits = authRateLimits()

  app.post('/auth/register', async (c) => {
    const authConfig = getAuthConfig()
    if (!authConfig.localPasswordEnabled) {
      return c.json({ error: 'Password registration is disabled for this instance' }, 404)
    }
    const body = RegisterSchema.parse(await readBody(c))
    const user = await authService.register(body.email, body.password)
    await startSession(c, { userId: user.id, email: user.email })
    return c.json({ id: user.id, email: user.email }, 201)
  })

  app.post('/auth/login', limits.passwordLogin, async (c) => {
    const authConfig = getAuthConfig()
    if (!authConfig.localPasswordEnabled) {
      return c.json({ error: 'Password login is disabled for this instance' }, 404)
    }
    const body = LoginSchema.parse(await readBody(c))
    const payload = await authService.login(body.email, body.password)
    await startSession(c, { userId: payload.userId, email: payload.email })
    return c.json({ id: payload.userId, email: payload.email })
  })

  app.post('/auth/logout', async (c) => {
    clearSession(c)
    return c.json({ ok: true })
  })

  app.get('/auth/me', authenticate, async (c) => {
    const me = await authService.getMe(c.var.user.userId)
    // The platform subject this session was issued for (multi-account
    // sessions): lets the account switcher mark the current identity by sub.
    return c.json({ ...me, platformSub: c.var.user.platformSub ?? null })
  })

  app.get('/auth/me/tasks', authenticate, async (c) => {
    const userId = c.var.user.userId
    const tasks = await prisma.translation.findMany({
      where: {
        updatedById: userId,
        status: { in: ['IN_PROGRESS', 'SUBMITTED'] },
        // Only projects the person is still on, in an account they are still
        // in: leaving either ends its tasks.
        key: { project: { memberships: { some: { userId } }, account: { members: { some: { userId } } } } },
      },
      include: {
        key: { include: { project: { select: { id: true, name: true } } } },
        locale: { select: { code: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 50,
    })
    return c.json(tasks)
  })

  app.patch('/auth/me', authenticate, async (c) => {
    const body = (await readBody(c)) as {
      email?: string
      name?: string
      currentPassword?: string
      newPassword?: string
      preferredLocales?: string[]
    }
    return c.json(await authService.updateProfile(c.var.user.userId, body))
  })

  app.post('/auth/me/deactivate', authenticate, async (c) => {
    await authService.deactivateUser(c.var.user.userId, c.var.user.userId)
    clearSession(c)
    return c.json({ ok: true })
  })

  // OTP routes
  app.post('/auth/otp/request', limits.otpRequest, async (c) => {
    const authConfig = getAuthConfig()
    if (!authConfig.localOtpEnabled) {
      return c.json({ error: 'OTP login is disabled for this instance' }, 404)
    }
    const { email } = OtpRequestSchema.parse(await readBody(c))
    await otpService.requestOtp(email.toLowerCase().trim())
    return c.json({ ok: true })
  })

  app.post('/auth/otp/verify', limits.otpVerify, async (c) => {
    const authConfig = getAuthConfig()
    if (!authConfig.localOtpEnabled) {
      return c.json({ error: 'OTP login is disabled for this instance' }, 404)
    }
    const { email, code } = OtpVerifySchema.parse(await readBody(c))
    const payload = await otpService.verifyOtp(email.toLowerCase().trim(), code.trim())
    await startSession(c, { userId: payload.userId, email: payload.email })
    return c.json({ id: payload.userId, email: payload.email })
  })

  // ── Federated sign-in ──────────────────────────────────────────────────────
  //
  // Both legs run here. The browser is handed to the provider and comes back
  // with a code (OIDC) or a token (Platform handover); neither reaches the
  // page, and the session cookie is already set by the time the SPA loads.

  app.get('/auth/sso/start', async (c) => {
    const runtime = await ssoService.getSsoRuntime()
    if (!runtime) return c.json({ error: 'Single sign-on is not configured on this instance' }, 404)

    const redirectUri = ssoService.ssoCallbackUrl()
    const landing = c.req.query('redirect')
    if (typeof landing === 'string') {
      setCookie(c, SSO_LANDING_COOKIE, landing, ssoCookieOptions())
    }

    if (runtime.mode === 'oidc') {
      let authorize: { url: string; handshake: unknown }
      try {
        authorize = await runtime.client.authorizeUrl(redirectUri)
      } catch (err) {
        // Discovery is a network call to someone else's server, so it fails in
        // ways a sign-in page cannot act on. Log the reason and send the
        // person somewhere that says so.
        console.error('oidc discovery failed', err)
        return c.redirect(ssoService.loginErrorUrl('sso_discovery'))
      }
      setCookie(c, SSO_HANDSHAKE_COOKIE, JSON.stringify(authorize.handshake), ssoCookieOptions())
      return c.redirect(authorize.url)
    }

    const state = randomBytes(16).toString('hex')
    setCookie(c, SSO_STATE_COOKIE, state, ssoCookieOptions())
    // Through sso.service, never by importing the EE package here. The
    // Community image builds with packages/ee/src/index.ts replaced by a stub
    // carrying only the entitlement functions, so a directly typed import of
    // anything else fails to compile in exactly the build that ships.
    return c.redirect(
      await ssoService.handoverAuthorizeUrl(runtime.config, redirectUri, state, {
        loginHint: ssoService.loginHintOf(c),
        prompt: c.req.query('prompt'),
      }),
    )
  })

  app.get('/auth/sso/callback', limits.federatedCallback, async (c) => {
    const runtime = await ssoService.getSsoRuntime()
    if (!runtime) return c.json({ error: 'Single sign-on is not configured on this instance' }, 404)

    const query = c.req.query() as Record<string, string | undefined>
    const landing = ssoService.safeLandingUrl(getCookie(c, SSO_LANDING_COOKIE))

    if (query.error) {
      clearSsoCookies(c)
      return c.redirect(ssoService.loginErrorUrl(query.error))
    }

    let claims: {
      sub: string
      email: string
      name?: string
      app_plan?: string
      iss?: string
      picture?: unknown
      role?: unknown
    }
    if (runtime.mode === 'oidc') {
      const raw = getCookie(c, SSO_HANDSHAKE_COOKIE)
      if (!raw || !query.code || !query.state) {
        clearSsoCookies(c)
        return c.redirect(ssoService.loginErrorUrl('sso_state'))
      }
      let handshake: { state: string; nonce: string; verifier: string }
      try {
        handshake = JSON.parse(raw)
      } catch {
        clearSsoCookies(c)
        return c.redirect(ssoService.loginErrorUrl('sso_state'))
      }
      if (query.state !== handshake.state) {
        clearSsoCookies(c)
        return c.redirect(ssoService.loginErrorUrl('sso_state'))
      }
      try {
        claims = await runtime.client.exchange(query.code, ssoService.ssoCallbackUrl(), handshake)
      } catch (err) {
        // The reason never reaches the browser: telling an attacker which half
        // of a check failed is telling them how to pass it. It does reach the
        // log, because without it an SSO outage is indistinguishable from a
        // wrong code, and an exchange fails identically from here for a wrong
        // secret, an unregistered redirect_uri, a rotated key or a replay.
        console.error('oidc exchange failed', err)
        clearSsoCookies(c)
        return c.redirect(ssoService.loginErrorUrl('sso_token'))
      }
    } else {
      const expectedState = getCookie(c, SSO_STATE_COOKIE)
      if (!query.token || !query.state || !expectedState || query.state !== expectedState) {
        clearSsoCookies(c)
        return c.redirect(ssoService.loginErrorUrl('sso_state'))
      }
      try {
        claims = await runtime.verifier.verify(query.token)
      } catch (err) {
        console.error('sso token verification failed', err)
        clearSsoCookies(c)
        return c.redirect(ssoService.loginErrorUrl('sso_token'))
      }
    }

    clearSsoCookies(c)

    const identity = await platformAuthService.upsertUserFromClaims(claims, {
      autoProvision: runtime.config.autoProvision,
    })
    // Deactivated locally, or unknown on an instance that does not provision.
    // One answer for both on purpose: which of the two it is tells an outsider
    // whether an address has an account here.
    if (!identity) return c.redirect(ssoService.loginErrorUrl('not_a_member'))

    let bundleKey = readBundleKey(c)
    if (!bundleKey) {
      bundleKey = bundleService.newBundleKey()
      setBundleKeyCookie(c, bundleKey)
    }
    await bundleService.upsertActiveIdentity(bundleKey, {
      platformSub: identity.platformSub,
      email: identity.email,
      name: identity.name,
    })

    await startSession(c, {
      userId: identity.userId,
      email: identity.email,
      plan: identity.plan,
      platformSub: identity.platformSub,
    })

    if (identity.created) {
      analytics.track('app_first_opened', { userId: identity.userId, props: { plan: identity.plan } })
    }
    analytics.track('app_session_started', {
      userId: identity.userId,
      props: { plan: identity.plan, source: `sso_${runtime.mode}` },
    })

    return c.redirect(landing)
  })

  // Platform auth callback: validates a Nubisco Platform JWT and issues a local verba session.
  // Only active when PLATFORM_ISSUER env var is set.
  app.post('/auth/platform/callback', limits.federatedCallback, async (c) => {
    if (!platformAuthService.isPlatformAuthEnabled()) {
      return c.json({ error: 'Platform auth is not configured' }, 404)
    }
    const { token } = (await readBody<{ token?: unknown }>(c)) ?? {}
    if (!token || typeof token !== 'string') {
      return c.json({ error: 'token is required' }, 400)
    }
    const payload = await platformAuthService.verifyPlatformToken(token)
    if (!payload) {
      return c.json({ error: 'Invalid or expired platform token' }, 401)
    }

    // Append this identity to the browser's bundle (or create a new one) so
    // the user can later switch back without re-OTPing on platform. The bundle
    // cookie is independent of the local session token cookie: it survives
    // sign-out of an individual identity.
    let bundleKey = readBundleKey(c)
    if (!bundleKey) {
      bundleKey = bundleService.newBundleKey()
      setBundleKeyCookie(c, bundleKey)
    }
    await bundleService.upsertActiveIdentity(bundleKey, {
      platformSub: payload.platformSub,
      email: payload.email,
      name: payload.name,
    })

    await startSession(c, {
      userId: payload.userId,
      email: payload.email,
      plan: payload.plan,
      platformSub: payload.platformSub,
    })

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

    return c.json({
      id: payload.userId,
      email: payload.email,
      plan: payload.plan,
      platformSub: payload.platformSub,
    })
  })

  // List identities active in this browser's bundle. The frontend uses this
  // to render the account-switcher dropdown. No auth required: the bundle
  // cookie itself is the credential.
  app.get('/auth/identities', async (c) => {
    const bundleKey = readBundleKey(c)
    if (!bundleKey) return c.json({ identities: [] })
    const identities = await bundleService.listIdentities(bundleKey)
    return c.json({
      identities: identities.map((i) => ({
        platform_sub: i.platformSub,
        email: i.email,
        name: i.name,
        is_active: i.isActive,
        last_used_at: i.lastUsedAt.toISOString(),
      })),
    })
  })

  // Build the OIDC authorize URL the frontend should redirect to in order to
  // switch to a known identity. Verba does not store platform refresh tokens,
  // so switching always requires a round-trip to platform; but platform will
  // recognize the identity from its multi-identity session cookie and silently
  // mint a code (no OTP prompt) when login_hint matches.
  //
  // The frontend posts { platform_sub } and follows the returned URL.
  app.post('/auth/switch', async (c) => {
    const bundleKey = readBundleKey(c)
    if (!bundleKey) {
      return c.json({ error: 'No identity bundle on this browser' }, 400)
    }
    const platformSub = (await readBody<{ platform_sub?: string }>(c))?.platform_sub
    if (!platformSub) {
      return c.json({ error: 'platform_sub is required' }, 400)
    }
    const identity = await bundleService.findIdentity(bundleKey, platformSub)
    if (!identity) {
      return c.json({ error: 'Identity not found in this bundle' }, 404)
    }
    const issuer = process.env.PLATFORM_ISSUER
    if (!issuer) return c.json({ error: 'Platform auth not configured' }, 404)

    // Return the email; the frontend (which owns its origin and crypto for
    // OIDC state) builds the actual /api/auth/authorize URL with login_hint.
    return c.json({ email: identity.email })
  })

  // Drop an identity from this browser's bundle. If the dropped identity was
  // the active one, the local session cookie is also cleared so the next
  // request triggers a re-login. Other identities in the bundle stay intact.
  app.post('/auth/identities/remove', async (c) => {
    const bundleKey = readBundleKey(c)
    if (!bundleKey) return c.json({ remaining: [] })
    const platformSub = (await readBody<{ platform_sub?: string }>(c))?.platform_sub
    if (!platformSub) {
      return c.json({ error: 'platform_sub is required' }, 400)
    }
    const identity = await bundleService.findIdentity(bundleKey, platformSub)
    if (identity?.isActive) {
      clearSession(c)
    }
    const { remaining } = await bundleService.removeIdentity(bundleKey, platformSub)
    return c.json({
      remaining: remaining.map((i) => ({
        platform_sub: i.platformSub,
        email: i.email,
        name: i.name,
        is_active: i.isActive,
      })),
    })
  })

  // Returns whether platform auth is configured: used by the frontend to show the platform login button
  app.get('/auth/platform/config', (c) =>
    c.json({
      enabled: platformAuthService.isPlatformAuthEnabled(),
      issuer: process.env.PLATFORM_ISSUER ?? null,
    }),
  )

  // People the caller already shares a project with, by email fragment.
  // Never the whole instance: see authService.searchCoMembers.
  app.get('/users', authenticate, async (c) => {
    const email = c.req.query('email')
    if (!email) return c.json([])
    return c.json(await authService.searchCoMembers(c.var.user.userId, email))
  })
}
