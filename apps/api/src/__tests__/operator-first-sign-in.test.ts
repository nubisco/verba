import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Hosted Verba has no setup wizard (VERBA_AUTH_MODE=platform), so an empty
// database gets its first user and its first account from an operator's first
// sign-in through the identity provider. The real services run against a
// mocked database: what is asserted is what that sign-in creates, and what it
// must never create.

vi.mock('../prisma.js', () => ({
  prisma: {
    user: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    account: { count: vi.fn(), findUnique: vi.fn(), create: vi.fn() },
    instanceAuditLog: { create: vi.fn() },
  },
}))

import { prisma } from '../prisma.js'
import { upsertUserFromClaims } from '../services/platform-auth.service.js'
import { ensureFirstAccount, firstAccountName } from '../services/account.service.js'

const operator = { sub: 'accord-ops', email: 'Ops@Example.com', name: 'Ops', iss: 'https://auth.example.com' }

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('VERBA_OPERATORS', 'ops@example.com,second@example.com')
  vi.stubEnv('VERBA_SIGNUP_OPEN', 'false')
  vi.stubEnv('VERBA_AUTH_MODE', 'platform')
  vi.stubEnv('VERBA_FIRST_ACCOUNT_NAME', 'Nubisco')
  vi.mocked(prisma.user.findUnique).mockResolvedValue(null)
  vi.mocked(prisma.user.create).mockImplementation((async (args: { data: { email: string; name: string } }) => ({
    id: 'u-ops',
    email: args.data.email,
    name: args.data.name,
  })) as never)
  vi.mocked(prisma.account.count).mockResolvedValue(0)
  vi.mocked(prisma.account.findUnique).mockResolvedValue(null)
  vi.mocked(prisma.account.create).mockImplementation((async (args: { data: { name: string; slug: string } }) => ({
    id: 'acc-1',
    name: args.data.name,
    slug: args.data.slug,
  })) as never)
})

afterEach(() => vi.unstubAllEnvs())

describe("an operator's first sign-in through the identity provider", () => {
  it('creates their user and the first account, owned by them, while sign-up is closed', async () => {
    await expect(upsertUserFromClaims(operator)).resolves.toMatchObject({
      userId: 'u-ops',
      email: 'ops@example.com',
      platformSub: 'accord-ops',
      created: true,
    })
    expect(vi.mocked(prisma.user.create).mock.calls[0][0]).toMatchObject({
      data: { email: 'ops@example.com', name: 'Ops', passwordHash: '' },
    })
    expect(prisma.account.create).toHaveBeenCalledTimes(1)
    expect(vi.mocked(prisma.account.create).mock.calls[0][0]).toMatchObject({
      data: { name: 'Nubisco', slug: 'nubisco', members: { create: { userId: 'u-ops', role: 'OWNER' } } },
    })
    // In the instance audit record, like any account an operator creates.
    expect(vi.mocked(prisma.instanceAuditLog.create).mock.calls[0][0]).toMatchObject({
      data: { actorId: 'u-ops', action: 'account.created' },
    })
  })

  it('creates no second account when another operator signs in after the first', async () => {
    vi.mocked(prisma.account.count).mockResolvedValue(1)
    await expect(
      upsertUserFromClaims({ ...operator, sub: 'accord-2', email: 'second@example.com' }),
    ).resolves.toMatchObject({ created: true })
    expect(prisma.account.create).not.toHaveBeenCalled()
  })

  it('creates nothing when the same operator signs in again', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'u-ops',
      email: 'ops@example.com',
      name: 'Ops',
      deactivatedAt: null,
      avatarUrl: null,
      platformRole: null,
    } as never)
    vi.mocked(prisma.account.count).mockResolvedValue(1)
    await expect(upsertUserFromClaims(operator)).resolves.toMatchObject({ userId: 'u-ops', created: false })
    expect(prisma.user.create).not.toHaveBeenCalled()
    expect(prisma.account.create).not.toHaveBeenCalled()
  })

  it('gives an existing operator the first account if the instance still has none', async () => {
    // A sign-in that created the user and failed before the account is
    // repaired by the next one.
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'u-ops',
      email: 'ops@example.com',
      name: 'Ops',
      deactivatedAt: null,
      avatarUrl: null,
      platformRole: null,
    } as never)
    await upsertUserFromClaims(operator)
    expect(prisma.account.create).toHaveBeenCalledTimes(1)
  })

  it('refuses someone who is not an operator while sign-up is closed, and creates nothing', async () => {
    await expect(
      upsertUserFromClaims({ ...operator, sub: 'stranger', email: 'stranger@example.com' }),
    ).rejects.toMatchObject({ statusCode: 403, details: { code: 'signup_closed' } })
    expect(prisma.user.create).not.toHaveBeenCalled()
    expect(prisma.account.create).not.toHaveBeenCalled()
  })

  it('creates no account for someone who is not an operator, even when sign-up is open', async () => {
    vi.stubEnv('VERBA_SIGNUP_OPEN', 'true')
    await expect(upsertUserFromClaims({ ...operator, sub: 'new', email: 'new@example.com' })).resolves.toMatchObject({
      created: true,
    })
    expect(prisma.account.count).not.toHaveBeenCalled()
    expect(prisma.account.create).not.toHaveBeenCalled()
  })

  it('leaves the terms to the first page, as for any federated sign-in', async () => {
    vi.stubEnv('VERBA_TERMS_VERSION', '2026-11-02')
    await upsertUserFromClaims(operator)
    const data = (vi.mocked(prisma.user.create).mock.calls[0][0] as { data: Record<string, unknown> }).data
    expect(data.termsVersion).toBeUndefined()
    expect(data.termsAcceptedAt).toBeUndefined()
  })
})

describe('the first account', () => {
  it('is named by VERBA_FIRST_ACCOUNT_NAME, else "My account"', () => {
    expect(firstAccountName({ VERBA_FIRST_ACCOUNT_NAME: '  Nubisco ' })).toBe('Nubisco')
    expect(firstAccountName({ VERBA_FIRST_ACCOUNT_NAME: '' })).toBe('My account')
    expect(firstAccountName({})).toBe('My account')
  })

  it('is created only on an instance with no accounts', async () => {
    vi.mocked(prisma.account.count).mockResolvedValue(3)
    await expect(ensureFirstAccount('u-ops')).resolves.toBeNull()
    expect(prisma.account.create).not.toHaveBeenCalled()
  })
})
