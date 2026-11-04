import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Every door that creates a user, with the sign-up switch and the terms. The
// real services run against a mocked database, so what is asserted is what
// each door does when the instance is closed, open, or asks for terms.

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
      create: vi.fn(),
      update: vi.fn(),
    },
    instanceAuditLog: { create: vi.fn() },
  },
}))

/** The terms.accepted events written to the instance audit record. */
function acceptances() {
  return vi
    .mocked(prisma.instanceAuditLog.create)
    .mock.calls.map(([args]) => (args as { data: Record<string, unknown> }).data)
    .filter((d) => d.action === 'terms.accepted')
    .map((d) => ({ ...d, detail: JSON.parse(String(d.detail)) }))
}

import { prisma } from '../prisma.js'
import { register } from '../services/auth.service.js'
import { hashCode, requestOtp, verifyOtp } from '../services/otp.service.js'
import { upsertUserFromClaims } from '../services/platform-auth.service.js'
import {
  acceptTerms,
  assertSignupAllowed,
  hasAcceptedTerms,
  signupOpen,
  termsConfig,
  termsStatus,
} from '../services/signup.service.js'

const NOW = new Date('2026-11-04T10:00:00Z')

const liveToken = () => ({
  id: 'otp1',
  email: 'new@example.com',
  code: hashCode('123456'),
  expiresAt: new Date(Date.now() + 60_000),
  used: false,
  attempts: 0,
  createdAt: new Date(),
})

const existingUser = { id: 'u1', email: 'old@example.com', deactivatedAt: null, avatarUrl: null, platformRole: null }

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.stubEnv('VERBA_OPERATORS', 'ops@example.com')
  vi.stubEnv('RESEND_API_KEY', '')
  vi.mocked(prisma.user.findUnique).mockResolvedValue(null)
  vi.mocked(prisma.user.create).mockImplementation((async (args: { data: { email: string } }) => ({
    id: 'u-new',
    email: args.data.email,
    name: null,
    isGlobalAdmin: false,
    createdAt: NOW,
  })) as never)
  vi.mocked(prisma.otpToken.findFirst).mockResolvedValue(liveToken() as never)
  vi.mocked(prisma.otpToken.updateMany).mockResolvedValue({ count: 1 })
})

afterEach(() => vi.unstubAllEnvs())

/** Whether verifyOtp spent the code (the second updateMany, `used: true`). */
function codeSpent(): boolean {
  return vi
    .mocked(prisma.otpToken.updateMany)
    .mock.calls.some(([args]) => (args as { data: { used?: boolean } }).data.used === true)
}

describe('the switches', () => {
  it('opens sign-up unless VERBA_SIGNUP_OPEN is "false", so self-hosters keep working', () => {
    expect(signupOpen({})).toBe(true)
    expect(signupOpen({ VERBA_SIGNUP_OPEN: 'true' })).toBe(true)
    expect(signupOpen({ VERBA_SIGNUP_OPEN: '' })).toBe(true)
    expect(signupOpen({ VERBA_SIGNUP_OPEN: 'false' })).toBe(false)
    expect(signupOpen({ VERBA_SIGNUP_OPEN: ' FALSE ' })).toBe(false)
  })

  it('has no terms step unless VERBA_TERMS_VERSION is set', () => {
    expect(termsConfig({})).toBeNull()
    expect(termsConfig({ VERBA_TERMS_URL: 'https://t' })).toBeNull()
    expect(
      termsConfig({ VERBA_TERMS_VERSION: '2026-12-01', VERBA_TERMS_URL: 'https://t', VERBA_PRIVACY_URL: 'https://p' }),
    ).toEqual({ version: '2026-12-01', termsUrl: 'https://t', privacyUrl: 'https://p' })
    expect(termsStatus('x')).toBeNull()
    expect(hasAcceptedTerms(null)).toBe(true)
  })

  it('lets an operator address through a closed instance', () => {
    vi.stubEnv('VERBA_SIGNUP_OPEN', 'false')
    expect(() => assertSignupAllowed('ops@example.com')).not.toThrow()
    expect(() => assertSignupAllowed('new@example.com')).toThrow(expect.objectContaining({ statusCode: 403 }))
  })
})

describe('email codes', () => {
  it('refuses a code for an address with no account when sign-up is closed, and sends nothing', async () => {
    vi.stubEnv('VERBA_SIGNUP_OPEN', 'false')
    await expect(requestOtp('new@example.com')).rejects.toMatchObject({
      statusCode: 403,
      details: { code: 'signup_closed' },
    })
    expect(prisma.otpToken.create).not.toHaveBeenCalled()
    expect(console.log).not.toHaveBeenCalled()
  })

  it('still sends a code to someone who has an account when sign-up is closed', async () => {
    vi.stubEnv('VERBA_SIGNUP_OPEN', 'false')
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'u1' } as never)
    await requestOtp('old@example.com')
    expect(prisma.otpToken.create).toHaveBeenCalled()
  })

  it('sends a code to an operator with no account yet when sign-up is closed', async () => {
    vi.stubEnv('VERBA_SIGNUP_OPEN', 'false')
    await requestOtp('ops@example.com')
    expect(prisma.otpToken.create).toHaveBeenCalled()
  })

  it('sends a code to a new address when sign-up is open', async () => {
    await requestOtp('new@example.com')
    expect(prisma.otpToken.create).toHaveBeenCalled()
  })

  it('creates no account from a code requested before sign-up closed, and keeps the code', async () => {
    vi.stubEnv('VERBA_SIGNUP_OPEN', 'false')
    await expect(verifyOtp('new@example.com', '123456')).rejects.toMatchObject({
      statusCode: 403,
      details: { code: 'signup_closed' },
    })
    expect(prisma.user.create).not.toHaveBeenCalled()
    expect(codeSpent()).toBe(false)
  })

  it('signs in an existing account with a code when sign-up is closed', async () => {
    vi.stubEnv('VERBA_SIGNUP_OPEN', 'false')
    vi.mocked(prisma.user.findUnique).mockResolvedValue(existingUser as never)
    await expect(verifyOtp('old@example.com', '123456')).resolves.toMatchObject({ userId: 'u1' })
    expect(prisma.user.create).not.toHaveBeenCalled()
  })

  it('creates a new account from a code when sign-up is open and there are no terms', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null).mockResolvedValueOnce(null)
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ ...existingUser, id: 'u-new' } as never)
    await expect(verifyOtp('new@example.com', '123456')).resolves.toMatchObject({ userId: 'u-new' })
    const data = vi.mocked(prisma.user.create).mock.calls[0][0].data as Record<string, unknown>
    expect(data.termsVersion).toBeUndefined()
    expect(acceptances()).toEqual([])
  })

  describe('with terms', () => {
    beforeEach(() => {
      vi.stubEnv('VERBA_TERMS_VERSION', '2026-12-01')
      vi.stubEnv('VERBA_TERMS_URL', 'https://example.com/terms')
      vi.stubEnv('VERBA_PRIVACY_URL', 'https://example.com/privacy')
    })

    it('asks a new address to accept them before the account exists, without spending the code', async () => {
      await expect(verifyOtp('new@example.com', '123456')).rejects.toMatchObject({
        statusCode: 409,
        details: { code: 'terms_required', terms: { version: '2026-12-01' } },
      })
      expect(prisma.user.create).not.toHaveBeenCalled()
      expect(codeSpent()).toBe(false)
    })

    it('refuses an old version of the terms', async () => {
      await expect(verifyOtp('new@example.com', '123456', { termsVersion: '2026-01-01' })).rejects.toMatchObject({
        statusCode: 409,
      })
      expect(prisma.user.create).not.toHaveBeenCalled()
    })

    it('stores the version and the time with the new account', async () => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(NOW)
      vi.mocked(prisma.otpToken.findFirst).mockResolvedValue(liveToken() as never)
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null).mockResolvedValueOnce(null)
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ ...existingUser, id: 'u-new' } as never)
      await verifyOtp('new@example.com', '123456', { termsVersion: '2026-12-01' })
      vi.useRealTimers()
      expect(vi.mocked(prisma.user.create).mock.calls[0][0].data).toMatchObject({
        email: 'new@example.com',
        termsVersion: '2026-12-01',
        termsAcceptedAt: NOW,
      })
      expect(codeSpent()).toBe(true)
      expect(acceptances()).toEqual([
        {
          actorId: 'u-new',
          action: 'terms.accepted',
          targetUserId: 'u-new',
          detail: { version: '2026-12-01', acceptedAt: NOW.toISOString() },
        },
      ])
    })

    it('records no acceptance when the terms were refused', async () => {
      await expect(verifyOtp('new@example.com', '123456')).rejects.toMatchObject({ statusCode: 409 })
      expect(acceptances()).toEqual([])
    })

    it('does not ask an existing account at sign-in (the first page does)', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(existingUser as never)
      await expect(verifyOtp('old@example.com', '123456')).resolves.toMatchObject({ userId: 'u1' })
    })

    it('records an acceptance of the current version only', async () => {
      await expect(acceptTerms('u1', '2026-01-01')).rejects.toMatchObject({ statusCode: 409 })
      expect(prisma.user.update).not.toHaveBeenCalled()
      expect(acceptances()).toEqual([])
      await expect(acceptTerms('u1', '2026-12-01', NOW)).resolves.toBe('2026-12-01')
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { termsVersion: '2026-12-01', termsAcceptedAt: NOW },
      })
      expect(acceptances()).toEqual([
        {
          actorId: 'u1',
          action: 'terms.accepted',
          targetUserId: 'u1',
          detail: { version: '2026-12-01', acceptedAt: NOW.toISOString() },
        },
      ])
      expect(termsStatus('2026-01-01')).toMatchObject({ version: '2026-12-01', accepted: false })
      expect(termsStatus('2026-12-01')).toMatchObject({ accepted: true })
    })
  })
})

describe('password registration', () => {
  it('is refused when sign-up is closed', async () => {
    vi.stubEnv('VERBA_SIGNUP_OPEN', 'false')
    await expect(register('new@example.com', 'password1')).rejects.toMatchObject({ statusCode: 403 })
    expect(prisma.user.create).not.toHaveBeenCalled()
  })

  it('asks for the terms when the instance has them, and stores them', async () => {
    vi.stubEnv('VERBA_TERMS_VERSION', 'v2')
    await expect(register('new@example.com', 'password1')).rejects.toMatchObject({ statusCode: 409 })
    await register('new@example.com', 'password1', { termsVersion: 'v2' })
    expect(vi.mocked(prisma.user.create).mock.calls[0][0].data).toMatchObject({ termsVersion: 'v2' })
    expect(acceptances()).toMatchObject([{ targetUserId: 'u-new', detail: { version: 'v2' } }])
  })

  it('lets first-run setup create the operator without the terms step', async () => {
    vi.stubEnv('VERBA_SIGNUP_OPEN', 'false')
    vi.stubEnv('VERBA_TERMS_VERSION', 'v2')
    await register('ops@example.com', 'password1', { skipTerms: true })
    expect(prisma.user.create).toHaveBeenCalled()
    expect(acceptances()).toEqual([])
  })
})

describe('federated sign-in (Accord handover and OIDC auto-provision)', () => {
  const claims = { sub: 'p-1', email: 'New@Example.com', name: 'New' }

  it('provisions nobody when sign-up is closed, and says why', async () => {
    vi.stubEnv('VERBA_SIGNUP_OPEN', 'false')
    await expect(upsertUserFromClaims(claims, { autoProvision: true })).rejects.toMatchObject({
      statusCode: 403,
      details: { code: 'signup_closed' },
    })
    expect(prisma.user.create).not.toHaveBeenCalled()
  })

  it('signs in someone who already has an account when sign-up is closed', async () => {
    vi.stubEnv('VERBA_SIGNUP_OPEN', 'false')
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ ...existingUser, name: 'Old' } as never)
    await expect(upsertUserFromClaims({ ...claims, email: 'old@example.com' })).resolves.toMatchObject({
      userId: 'u1',
      created: false,
    })
  })

  it('still answers null for someone unknown on an instance that does not provision', async () => {
    vi.stubEnv('VERBA_SIGNUP_OPEN', 'false')
    await expect(upsertUserFromClaims(claims, { autoProvision: false })).resolves.toBeNull()
  })

  it('provisions a new person when sign-up is open', async () => {
    await expect(upsertUserFromClaims(claims)).resolves.toMatchObject({ created: true })
  })
})
