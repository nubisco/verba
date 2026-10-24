import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../prisma.js', () => ({
  prisma: {
    otpToken: {
      findFirst: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
      create: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
  },
}))

vi.mock('../services/auth.service.js', () => ({
  createOtpOnlyUser: vi.fn(),
}))

import { prisma } from '../prisma.js'
import {
  OTP_MAX_ATTEMPTS,
  hashCode,
  isDisposableEmail,
  mailFrom,
  requestOtp,
  verifyOtp,
} from '../services/otp.service.js'

const liveToken = (overrides: Record<string, unknown> = {}) => ({
  id: 'otp1',
  email: 'a@example.com',
  code: hashCode('123456'),
  expiresAt: new Date(Date.now() + 60_000),
  used: false,
  attempts: 0,
  createdAt: new Date(),
  ...overrides,
})

describe('verifyOtp', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(prisma.otpToken.findFirst).mockResolvedValue(liveToken() as never)
    vi.mocked(prisma.otpToken.updateMany).mockResolvedValue({ count: 1 })
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'u1',
      email: 'a@example.com',
      isGlobalAdmin: false,
      deactivatedAt: null,
    } as never)
  })

  it('signs in with the right code and spends it', async () => {
    await expect(verifyOtp('a@example.com', '123456')).resolves.toMatchObject({ userId: 'u1' })
    expect(prisma.otpToken.updateMany).toHaveBeenLastCalledWith({
      where: { id: 'otp1', used: false },
      data: { used: true },
    })
  })

  it('counts every guess before comparing it', async () => {
    await expect(verifyOtp('a@example.com', '000000')).rejects.toMatchObject({ statusCode: 401 })
    expect(prisma.otpToken.updateMany).toHaveBeenCalledWith({
      where: { id: 'otp1', used: false, attempts: { lt: OTP_MAX_ATTEMPTS } },
      data: { attempts: { increment: 1 } },
    })
  })

  it('looks the code up by address only, so a guess cannot pick another live code', async () => {
    await verifyOtp('a@example.com', '123456')
    const where = vi.mocked(prisma.otpToken.findFirst).mock.calls[0][0]?.where
    expect(where).not.toHaveProperty('code')
  })

  it('locks the code once the attempt cap is reached, even for the right code', async () => {
    // The conditional increment matches nothing: attempts is already at the cap.
    vi.mocked(prisma.otpToken.updateMany).mockResolvedValueOnce({ count: 0 })
    await expect(verifyOtp('a@example.com', '123456')).rejects.toMatchObject({ statusCode: 429 })
    expect(prisma.otpToken.updateMany).toHaveBeenLastCalledWith({ where: { id: 'otp1' }, data: { used: true } })
    expect(prisma.user.findUnique).not.toHaveBeenCalled()
  })

  it('refuses a code a parallel request already spent', async () => {
    vi.mocked(prisma.otpToken.updateMany)
      .mockResolvedValueOnce({ count: 1 }) // attempt counted
      .mockResolvedValueOnce({ count: 0 }) // already used
    await expect(verifyOtp('a@example.com', '123456')).rejects.toMatchObject({ statusCode: 401 })
  })

  it('refuses when there is no live code', async () => {
    vi.mocked(prisma.otpToken.findFirst).mockResolvedValue(null)
    await expect(verifyOtp('a@example.com', '123456')).rejects.toMatchObject({ statusCode: 401 })
  })
})

describe('requestOtp', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    delete process.env.RESEND_API_KEY
    delete process.env.SMTP_HOST
  })

  it('stores a hash, never the code', async () => {
    await requestOtp('a@example.com')
    const data = vi.mocked(prisma.otpToken.create).mock.calls[0][0].data
    expect(data.code).toMatch(/^[0-9a-f]{64}$/)
  })

  it('refuses a new account at a throwaway domain', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null)
    await expect(requestOtp('x@mailinator.com')).rejects.toMatchObject({ statusCode: 422 })
    expect(prisma.otpToken.create).not.toHaveBeenCalled()
  })

  it('still lets an existing account at a throwaway domain sign in', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'u1' } as never)
    await requestOtp('x@mailinator.com')
    expect(prisma.otpToken.create).toHaveBeenCalled()
  })
})

describe('isDisposableEmail', () => {
  it('matches the domain and its subdomains, and extra domains from config', () => {
    expect(isDisposableEmail('a@yopmail.com', '')).toBe(true)
    expect(isDisposableEmail('a@eu.mailinator.com', '')).toBe(true)
    expect(isDisposableEmail('a@example.com', '')).toBe(false)
    expect(isDisposableEmail('a@notmailinator.com', '')).toBe(false)
    expect(isDisposableEmail('a@spam.test', 'spam.test, other.test')).toBe(true)
  })
})

describe('mailFrom', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('sends from the configured address on every transport', () => {
    expect(mailFrom({ MAIL_FROM: 'Verba <hi@example.com>', SMTP_FROM: 'x@y.z' } as NodeJS.ProcessEnv)).toBe(
      'Verba <hi@example.com>',
    )
    expect(mailFrom({ SMTP_FROM: 'x@y.z' } as NodeJS.ProcessEnv)).toBe('x@y.z')
  })
})
