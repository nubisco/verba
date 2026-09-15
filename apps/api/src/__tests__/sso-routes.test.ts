import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The EE engine is mocked here on purpose: its own signature, audience and
// nonce checks are covered in packages/ee/src/sso/sso.test.ts against a real
// RSA key. What these tests are for is the wiring around it — the state and
// handshake cookies, what is and is not told to the browser on failure, and
// the landing redirect.
// vi.hoisted, because vi.mock factories are lifted above the imports and
// would otherwise reach these while they are still in the temporal dead zone.
const { ssoRuntimeFromEnv, handoverAuthorizeUrl } = vi.hoisted(() => ({
  ssoRuntimeFromEnv: vi.fn(),
  handoverAuthorizeUrl: vi.fn(
    (config: { authorizeUrl: string; appId: string }, redirectUri: string, state: string) =>
      `${config.authorizeUrl}?app_id=${config.appId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`,
  ),
}))

vi.mock('@nubisco/verba-ee', () => ({
  ssoRuntimeFromEnv,
  handoverAuthorizeUrl,
  isSSOEnabled: () => true,
}))

vi.mock('../services/auth.service.js', () => ({
  register: vi.fn(),
  login: vi.fn(),
  getMe: vi.fn(),
  createOtpOnlyUser: vi.fn(),
}))
vi.mock('../services/otp.service.js', () => ({ requestOtp: vi.fn(), verifyOtp: vi.fn() }))
vi.mock('../services/platform-auth.service.js', () => ({
  verifyPlatformToken: vi.fn(),
  isPlatformAuthEnabled: vi.fn(() => false),
  upsertUserFromClaims: vi.fn(),
}))
vi.mock('../services/identity-bundle.service.js', () => ({
  BUNDLE_COOKIE: 'verba_bundle',
  BUNDLE_TTL_DAYS: 30,
  newBundleKey: vi.fn(() => 'bundle-key'),
  upsertActiveIdentity: vi.fn(),
  listIdentities: vi.fn(async () => []),
  removeIdentity: vi.fn(async () => ({ remaining: [] })),
  findIdentity: vi.fn(async () => null),
}))
vi.mock('../services/analytics.service.js', () => ({ track: vi.fn() }))
vi.mock('../prisma.js', () => ({
  prisma: { user: { count: vi.fn(), findMany: vi.fn() }, translation: { findMany: vi.fn() } },
}))

import { buildApp } from '../app.js'
import * as platformAuthService from '../services/platform-auth.service.js'
import { resetSsoRuntimeForTests, safeLandingUrl, ssoCallbackUrl } from '../services/sso.service.js'

const WEB = 'https://verba.example.com'

const handoverConfig = {
  issuer: 'https://platform.nubisco.io',
  authorizeUrl: 'https://platform.nubisco.io/api/auth/sso',
  appId: 'nubisco-verba',
  autoProvision: true,
  label: 'Nubisco Platform',
}

/** A verifier that accepts one token and rejects everything else. */
function handoverRuntime(verify: () => Promise<unknown>) {
  return { mode: 'handover', config: handoverConfig, verifier: { verify } }
}

function cookiesOf(res: { headers: Record<string, unknown> }): Record<string, string> {
  const raw = res.headers['set-cookie']
  const list = Array.isArray(raw) ? raw : raw ? [String(raw)] : []
  return Object.fromEntries(
    list.map((c) => {
      const [pair] = c.split(';')
      const idx = pair.indexOf('=')
      return [pair.slice(0, idx), pair.slice(idx + 1)]
    }),
  )
}

describe('federated sign-in routes', () => {
  const saved = { ...process.env }

  beforeEach(() => {
    vi.clearAllMocks()
    resetSsoRuntimeForTests()
    process.env.JWT_SECRET = 'test-secret'
    process.env.CORS_ORIGIN = WEB
    delete process.env.PUBLIC_API_URL
    ssoRuntimeFromEnv.mockReturnValue(null)
  })

  afterEach(() => {
    process.env = { ...saved }
  })

  it('is absent, not merely hidden, when no provider is configured', async () => {
    const app = buildApp()
    const start = await app.inject({ method: 'GET', url: '/auth/sso/start' })
    const callback = await app.inject({ method: 'GET', url: '/auth/sso/callback?token=x&state=y' })
    await app.close()

    expect(start.statusCode).toBe(404)
    expect(callback.statusCode).toBe(404)
  })

  it('redirects to the provider and keeps the state in an httpOnly cookie', async () => {
    ssoRuntimeFromEnv.mockReturnValue(handoverRuntime(async () => ({})))
    const app = buildApp()
    const res = await app.inject({ method: 'GET', url: '/auth/sso/start?redirect=/projects/42' })
    await app.close()

    expect(res.statusCode).toBe(302)
    const location = new URL(res.headers.location as string)
    expect(location.origin + location.pathname).toBe('https://platform.nubisco.io/api/auth/sso')
    expect(location.searchParams.get('app_id')).toBe('nubisco-verba')
    expect(location.searchParams.get('redirect_uri')).toBe(ssoCallbackUrl())

    // The state must be held where script cannot read it, and it must be the
    // same value the provider was just handed.
    const setCookie = (res.headers['set-cookie'] as string[]).join(';')
    expect(setCookie).toContain('verba_sso_state=')
    expect(setCookie).toContain('HttpOnly')
    expect(cookiesOf(res).verba_sso_state).toBe(location.searchParams.get('state'))
  })

  it('refuses a callback whose state does not match the cookie', async () => {
    ssoRuntimeFromEnv.mockReturnValue(handoverRuntime(async () => ({})))
    const app = buildApp()
    const res = await app.inject({
      method: 'GET',
      url: '/auth/sso/callback?token=tok&state=forged',
      cookies: { verba_sso_state: 'genuine' },
    })
    await app.close()

    expect(res.statusCode).toBe(302)
    expect(res.headers.location).toBe(`${WEB}/login?error=sso_state`)
    // A rejected callback must not leave a session behind.
    expect(cookiesOf(res).token).toBeUndefined()
  })

  it('tells the browser only that sign-in failed, never which check failed', async () => {
    ssoRuntimeFromEnv.mockReturnValue(
      handoverRuntime(async () => {
        throw new Error('JWT signature verification failed')
      }),
    )
    const app = buildApp()
    const res = await app.inject({
      method: 'GET',
      url: '/auth/sso/callback?token=tok&state=st',
      cookies: { verba_sso_state: 'st' },
    })
    await app.close()

    expect(res.headers.location).toBe(`${WEB}/login?error=sso_token`)
    expect(res.headers.location).not.toContain('signature')
  })

  it('mints a session and lands on the requested page after a good sign-in', async () => {
    ssoRuntimeFromEnv.mockReturnValue(
      handoverRuntime(async () => ({ sub: 'p-1', email: 'alice@example.com', name: 'Alice' })),
    )
    vi.mocked(platformAuthService.upsertUserFromClaims).mockResolvedValue({
      userId: 'u1',
      email: 'alice@example.com',
      plan: 'pro',
      platformSub: 'p-1',
      name: 'Alice',
      created: false,
    })

    const app = buildApp()
    const res = await app.inject({
      method: 'GET',
      url: '/auth/sso/callback?token=tok&state=st',
      cookies: { verba_sso_state: 'st', verba_sso_landing: '/projects/42' },
    })
    await app.close()

    expect(res.statusCode).toBe(302)
    expect(res.headers.location).toBe(`${WEB}/projects/42`)
    expect(cookiesOf(res).token).toBeTruthy()
    // The one-shot cookies are spent, so a replay of this callback cannot
    // reuse the state it just satisfied.
    const setCookie = (res.headers['set-cookie'] as string[]).join(';')
    expect(setCookie).toContain('verba_sso_state=;')
  })

  it('turns away someone the instance will not provision', async () => {
    ssoRuntimeFromEnv.mockReturnValue(handoverRuntime(async () => ({ sub: 'p-2', email: 'stranger@example.com' })))
    vi.mocked(platformAuthService.upsertUserFromClaims).mockResolvedValue(null)

    const app = buildApp()
    const res = await app.inject({
      method: 'GET',
      url: '/auth/sso/callback?token=tok&state=st',
      cookies: { verba_sso_state: 'st' },
    })
    await app.close()

    expect(res.headers.location).toBe(`${WEB}/login?error=not_a_member`)
    expect(cookiesOf(res).token).toBeUndefined()
  })

  it('advertises the provider and its name on the public config', async () => {
    ssoRuntimeFromEnv.mockReturnValue(handoverRuntime(async () => ({})))
    const app = buildApp()
    const res = await app.inject({ method: 'GET', url: '/config' })
    await app.close()

    expect(res.json().auth.sso).toEqual({ enabled: true, mode: 'handover', label: 'Nubisco Platform' })
  })
})

describe('safeLandingUrl', () => {
  const saved = { ...process.env }
  beforeEach(() => {
    process.env.CORS_ORIGIN = WEB
  })
  afterEach(() => {
    process.env = { ...saved }
  })

  it('keeps a same-site path', () => {
    expect(safeLandingUrl('/projects/42')).toBe(`${WEB}/projects/42`)
  })

  // The landing target survives a round trip through the provider, so an
  // attacker who can choose it could otherwise deposit a freshly
  // authenticated person on a site of their choosing.
  it('refuses to send a signed-in user anywhere off-site', () => {
    for (const hostile of [
      'https://evil.example.com/steal',
      '//evil.example.com/steal',
      'javascript:alert(1)',
      '',
      undefined,
    ]) {
      expect(safeLandingUrl(hostile)).toBe(`${WEB}/projects`)
    }
  })
})
