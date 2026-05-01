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
import * as otpService from '../services/otp.service.js'

describe('auth and setup routes', () => {
  const originalEnv = {
    ENABLE_LOCAL_PASSWORD: process.env.ENABLE_LOCAL_PASSWORD,
    DISABLE_LOCAL_OTP: process.env.DISABLE_LOCAL_OTP,
    PLATFORM_ISSUER: process.env.PLATFORM_ISSUER,
    JWT_SECRET: process.env.JWT_SECRET,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.JWT_SECRET = 'test-secret'
    delete process.env.ENABLE_LOCAL_PASSWORD
    delete process.env.DISABLE_LOCAL_OTP
    delete process.env.PLATFORM_ISSUER

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
    process.env.JWT_SECRET = originalEnv.JWT_SECRET
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
      features: {
        organizations: false,
      },
    })
  })

  it('exposes hybrid mode when local password and platform are enabled', async () => {
    process.env.ENABLE_LOCAL_PASSWORD = 'true'
    process.env.PLATFORM_ISSUER = 'https://platform.example.com'

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
      },
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
    expect(res.cookies.some((cookie) => cookie.name === 'token')).toBe(true)
  })
})
