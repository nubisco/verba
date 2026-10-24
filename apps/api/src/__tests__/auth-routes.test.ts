import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../services/auth.service.js', () => ({
  register: vi.fn(),
  login: vi.fn(),
  getMe: vi.fn(),
  createOtpOnlyUser: vi.fn(),
}))

vi.mock('../services/otp.service.js', () => ({
  requestOtp: vi.fn(),
  verifyOtp: vi.fn(),
}))

vi.mock('../services/platform-auth.service.js', () => ({
  verifyPlatformToken: vi.fn(),
  isPlatformAuthEnabled: vi.fn(() => false),
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

vi.mock('../services/analytics.service.js', () => ({
  track: vi.fn(),
}))

vi.mock('../services/account.service.js', () => ({
  createOwnedAccount: vi.fn(async () => ({ id: 'acc1' })),
}))

vi.mock('../services/operator.service.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/operator.service.js')>()),
  syncOperatorFlag: vi.fn(),
}))

vi.mock('../prisma.js', () => ({
  prisma: {
    user: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
    translation: {
      findMany: vi.fn(),
    },
  },
}))

import { buildApp } from '../app.js'
import { prisma } from '../prisma.js'
import * as authService from '../services/auth.service.js'
import * as accountService from '../services/account.service.js'
import * as otpService from '../services/otp.service.js'
import * as platformAuthService from '../services/platform-auth.service.js'
import { AUTH_LIMITS, trustProxySetting } from '../rate-limits.js'

describe('auth and setup routes', () => {
  const originalEnv = {
    ENABLE_LOCAL_PASSWORD: process.env.ENABLE_LOCAL_PASSWORD,
    DISABLE_LOCAL_OTP: process.env.DISABLE_LOCAL_OTP,
    PLATFORM_ISSUER: process.env.PLATFORM_ISSUER,
    PLATFORM_APP_ID: process.env.PLATFORM_APP_ID,
    JWT_SECRET: process.env.JWT_SECRET,
    VERBA_OPERATORS: process.env.VERBA_OPERATORS,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.JWT_SECRET = 'test-secret'
    process.env.VERBA_OPERATORS = 'admin@example.com'
    delete process.env.ENABLE_LOCAL_PASSWORD
    delete process.env.DISABLE_LOCAL_OTP
    delete process.env.PLATFORM_ISSUER
    delete process.env.PLATFORM_APP_ID

    vi.mocked(prisma.user.count).mockResolvedValue(0)
    vi.mocked(authService.register).mockResolvedValue({
      id: 'u1',
      email: 'admin@example.com',
    } as Awaited<ReturnType<typeof authService.register>>)
    vi.mocked(authService.createOtpOnlyUser).mockResolvedValue({
      id: 'u1',
      email: 'admin@example.com',
    } as Awaited<ReturnType<typeof authService.createOtpOnlyUser>>)
    vi.mocked(authService.login).mockResolvedValue({
      userId: 'u1',
      email: 'admin@example.com',
      isGlobalAdmin: true,
    })
    vi.mocked(otpService.verifyOtp).mockResolvedValue({
      userId: 'u1',
      email: 'admin@example.com',
      isGlobalAdmin: true,
    })
  })

  afterEach(() => {
    process.env.ENABLE_LOCAL_PASSWORD = originalEnv.ENABLE_LOCAL_PASSWORD
    process.env.DISABLE_LOCAL_OTP = originalEnv.DISABLE_LOCAL_OTP
    process.env.PLATFORM_ISSUER = originalEnv.PLATFORM_ISSUER
    process.env.PLATFORM_APP_ID = originalEnv.PLATFORM_APP_ID
    process.env.JWT_SECRET = originalEnv.JWT_SECRET
    process.env.VERBA_OPERATORS = originalEnv.VERBA_OPERATORS
  })

  it('exposes OTP-first CE config by default', async () => {
    const app = buildApp()
    const res = await app.inject({ method: 'GET', url: '/config' })
    await app.close()

    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({
      auth: {
        mode: 'local_otp',
        localOtpEnabled: true,
        localPasswordEnabled: false,
        platformEnabled: false,
        platformIssuer: null,
      },
      features: {},
    })
  })

  it('exposes hybrid mode when local password and platform are enabled', async () => {
    process.env.ENABLE_LOCAL_PASSWORD = 'true'
    process.env.PLATFORM_ISSUER = 'https://platform.example.com'
    process.env.PLATFORM_APP_ID = 'nubisco-verba'

    const app = buildApp()
    const res = await app.inject({ method: 'GET', url: '/config' })
    await app.close()

    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({
      auth: {
        mode: 'hybrid',
        localOtpEnabled: true,
        localPasswordEnabled: true,
        platformEnabled: true,
        platformIssuer: 'https://platform.example.com',
        platformAppId: 'nubisco-verba',
      },
    })
  })

  // Regression: the frontend used to fall back to app_id 'verba' when
  // PLATFORM_APP_ID was unset, and no platform app carries that slug (ours is
  // 'nubisco-verba'), so every sign-in bounced off `unknown_app`. A
  // half-configured instance must not advertise the button at all.
  it('does not enable platform auth when the app id is missing', async () => {
    process.env.PLATFORM_ISSUER = 'https://platform.example.com'

    const app = buildApp()
    const res = await app.inject({ method: 'GET', url: '/config' })
    await app.close()

    expect(res.statusCode).toBe(200)
    expect(res.json().auth).toMatchObject({
      platformEnabled: false,
      platformIssuer: 'https://platform.example.com',
      platformAppId: null,
    })
  })

  it('blocks password registration when local password auth is disabled', async () => {
    const app = buildApp()
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'admin@example.com', password: 'password123' },
    })
    await app.close()

    expect(res.statusCode).toBe(404)
    expect(vi.mocked(authService.register)).not.toHaveBeenCalled()
  })

  it('blocks password login when local password auth is disabled', async () => {
    const app = buildApp()
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'admin@example.com', password: 'password123' },
    })
    await app.close()

    expect(res.statusCode).toBe(404)
    expect(vi.mocked(authService.login)).not.toHaveBeenCalled()
  })

  it('rejects SQL-like OTP request emails with validation error', async () => {
    const app = buildApp()
    const res = await app.inject({
      method: 'POST',
      url: '/auth/otp/request',
      payload: { email: "admin@example.com' OR 1=1 --" },
    })
    await app.close()

    expect(res.statusCode).toBe(400)
    expect(res.json()).toMatchObject({ error: 'Validation error' })
    expect(vi.mocked(otpService.requestOtp)).not.toHaveBeenCalled()
  })

  it('rejects malformed or injected OTP codes with validation error', async () => {
    const app = buildApp()
    const res = await app.inject({
      method: 'POST',
      url: '/auth/otp/verify',
      payload: { email: 'admin@example.com', code: "123456' OR 1=1 --" },
    })
    await app.close()

    expect(res.statusCode).toBe(400)
    expect(res.json()).toMatchObject({ error: 'Validation error' })
    expect(vi.mocked(otpService.verifyOtp)).not.toHaveBeenCalled()
  })

  it('blocks OTP routes when local OTP is disabled', async () => {
    process.env.DISABLE_LOCAL_OTP = 'true'

    const app = buildApp()
    const res = await app.inject({
      method: 'POST',
      url: '/auth/otp/request',
      payload: { email: 'admin@example.com' },
    })
    await app.close()

    expect(res.statusCode).toBe(404)
    expect(vi.mocked(otpService.requestOtp)).not.toHaveBeenCalled()
  })

  it('requires adminPassword during setup when password auth is enabled', async () => {
    process.env.ENABLE_LOCAL_PASSWORD = 'true'

    const app = buildApp()
    const res = await app.inject({
      method: 'POST',
      url: '/setup',
      payload: { adminEmail: 'admin@example.com' },
    })
    await app.close()

    expect(res.statusCode).toBe(400)
    expect(res.json()).toMatchObject({
      error: 'adminPassword is required when password auth is enabled',
    })
  })

  it('refuses to set up an operator account for an address not in VERBA_OPERATORS', async () => {
    const app = buildApp()
    const res = await app.inject({
      method: 'POST',
      url: '/setup',
      payload: { adminEmail: 'first-stranger@example.com' },
    })
    await app.close()

    expect(res.statusCode).toBe(403)
    expect(res.json().error).toMatch(/VERBA_OPERATORS/)
    expect(vi.mocked(authService.createOtpOnlyUser)).not.toHaveBeenCalled()
  })

  it('bootstraps an OTP-only CE admin without requiring a password', async () => {
    const app = buildApp()
    const res = await app.inject({
      method: 'POST',
      url: '/setup',
      payload: { adminEmail: 'admin@example.com' },
    })
    await app.close()

    expect(res.statusCode).toBe(201)
    expect(vi.mocked(authService.createOtpOnlyUser)).toHaveBeenCalledWith('admin@example.com')
    // The operator owns the instance's first account, so the first project has a home.
    expect(vi.mocked(accountService.createOwnedAccount)).toHaveBeenCalledWith('u1', { name: 'My account' })
    expect(res.cookies.some((cookie) => cookie.name === 'token')).toBe(true)
  })

  it('threads the platform subject through the callback session into /auth/me', async () => {
    vi.mocked(platformAuthService.isPlatformAuthEnabled).mockReturnValueOnce(true)
    vi.mocked(platformAuthService.verifyPlatformToken).mockResolvedValueOnce({
      userId: 'u1',
      email: 'jose@nubisco.io',
      platformSub: 'u-jose',
      plan: 'free',
      name: 'Jose',
      created: false,
    })
    vi.mocked(authService.getMe).mockResolvedValueOnce({
      id: 'u1',
      email: 'jose@nubisco.io',
    } as unknown as Awaited<ReturnType<typeof authService.getMe>>)

    const app = buildApp()
    const callback = await app.inject({
      method: 'POST',
      url: '/auth/platform/callback',
      payload: { token: 'platform-jwt' },
    })
    expect(callback.statusCode).toBe(200)
    expect(callback.json()).toMatchObject({ id: 'u1', platformSub: 'u-jose' })

    const session = callback.cookies.find((cookie) => cookie.name === 'token')
    expect(session).toBeDefined()

    const me = await app.inject({
      method: 'GET',
      url: '/auth/me',
      cookies: { token: session!.value },
    })
    await app.close()

    expect(me.statusCode).toBe(200)
    expect(me.json()).toMatchObject({ platformSub: 'u-jose' })
  })

  describe('rate limits on the sign-in doors', () => {
    it('stops OTP requests for one address after the per-email limit', async () => {
      const app = buildApp()
      const send = (ip: string) =>
        app.inject({
          method: 'POST',
          url: '/auth/otp/request',
          remoteAddress: ip,
          payload: { email: 'victim@example.com' },
        })
      // Different machines, one address: the per-email key still applies.
      for (let i = 0; i < AUTH_LIMITS.otpRequest.perEmail; i++) {
        expect((await send(`203.0.113.${i + 1}`)).statusCode).toBe(200)
      }
      const blocked = await send('203.0.113.99')
      await app.close()

      expect(blocked.statusCode).toBe(429)
      expect(vi.mocked(otpService.requestOtp)).toHaveBeenCalledTimes(AUTH_LIMITS.otpRequest.perEmail)
    })

    it('stops OTP requests from one machine after the per-IP limit, whatever the address', async () => {
      const app = buildApp()
      let last = 0
      for (let i = 0; i <= AUTH_LIMITS.otpRequest.perIp; i++) {
        const res = await app.inject({
          method: 'POST',
          url: '/auth/otp/request',
          remoteAddress: '198.51.100.7',
          payload: { email: `user${i}@example.com` },
        })
        last = res.statusCode
      }
      await app.close()
      expect(last).toBe(429)
    })

    it('stops OTP verification for one address after the per-email limit', async () => {
      vi.mocked(otpService.verifyOtp).mockRejectedValue(
        Object.assign(new Error('Invalid or expired code'), { statusCode: 401 }),
      )
      const app = buildApp()
      const codes: number[] = []
      for (let i = 0; i <= AUTH_LIMITS.otpVerify.perEmail; i++) {
        const res = await app.inject({
          method: 'POST',
          url: '/auth/otp/verify',
          remoteAddress: `192.0.2.${i + 1}`,
          payload: { email: 'victim@example.com', code: String(100000 + i) },
        })
        codes.push(res.statusCode)
      }
      await app.close()
      expect(codes.slice(0, -1).every((c) => c === 401)).toBe(true)
      expect(codes.at(-1)).toBe(429)
    })

    it('does not let a client choose its own address with X-Forwarded-For', async () => {
      const app = buildApp()
      let last = 0
      for (let i = 0; i <= AUTH_LIMITS.otpRequest.perIp; i++) {
        const res = await app.inject({
          method: 'POST',
          url: '/auth/otp/request',
          remoteAddress: '198.51.100.8',
          headers: { 'x-forwarded-for': `10.9.8.${i}` },
          payload: { email: `spoof${i}@example.com` },
        })
        last = res.statusCode
      }
      await app.close()
      // The forged header comes from an untrusted public peer, so it is ignored.
      expect(last).toBe(429)
    })

    it('trusts only private proxies by default, and TRUST_PROXY can say otherwise', () => {
      expect(trustProxySetting(undefined)).toEqual(['loopback', 'linklocal', 'uniquelocal'])
      expect(trustProxySetting('false')).toBe(false)
      expect(trustProxySetting('10.0.0.1, 10.0.0.0/8')).toEqual(['10.0.0.1', '10.0.0.0/8'])
    })
  })
})
