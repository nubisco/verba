import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// A federated user is bound to their provider's `iss` and `sub` (Accord on
// hosted Verba), and matched by that before their email (Jose, 2026-11-04).
// The real service runs against a small in-memory User table, so every branch
// is asserted on what it reads and writes.

vi.mock('../prisma.js', () => ({
  prisma: {
    user: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    account: { count: vi.fn(), findUnique: vi.fn(), create: vi.fn() },
    instanceAuditLog: { create: vi.fn() },
  },
}))

import { prisma } from '../prisma.js'
import { upsertUserFromClaims } from '../services/platform-auth.service.js'

const ACCORD = 'https://accord.example.com'
const OTHER_IDP = 'https://idp.example.org'

type Row = {
  id: string
  email: string
  name: string | null
  deactivatedAt: Date | null
  avatarUrl: string | null
  platformRole: string | null
  platformIssuer: string | null
  platformSub: string | null
}

let users: Row[]

function user(overrides: Partial<Row> & { id: string; email: string }): Row {
  return {
    name: overrides.id,
    deactivatedAt: null,
    avatarUrl: null,
    platformRole: null,
    platformIssuer: null,
    platformSub: null,
    ...overrides,
  }
}

type Where = {
  email?: string
  id?: string
  platformIssuer_platformSub?: { platformIssuer: string; platformSub: string }
}

// A copy, as Prisma returns: a write must not change a row the service read.
function find(where: Where): Row | null {
  const row = findRow(where)
  return row ? { ...row } : null
}

function findRow(where: Where): Row | null {
  if (where.platformIssuer_platformSub) {
    const { platformIssuer, platformSub } = where.platformIssuer_platformSub
    return users.find((u) => u.platformIssuer === platformIssuer && u.platformSub === platformSub) ?? null
  }
  if (where.email) return users.find((u) => u.email === where.email) ?? null
  if (where.id) return users.find((u) => u.id === where.id) ?? null
  return null
}

function audits(): Array<{ action: string; targetUserId: string | null; detail: Record<string, unknown> | null }> {
  return vi.mocked(prisma.instanceAuditLog.create).mock.calls.map(([args]) => {
    const data = (args as { data: { action: string; targetUserId: string | null; detail: string | null } }).data
    return {
      action: data.action,
      targetUserId: data.targetUserId,
      detail: data.detail ? JSON.parse(data.detail) : null,
    }
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('VERBA_OPERATORS', '')
  vi.stubEnv('VERBA_SIGNUP_OPEN', 'true')
  users = []
  vi.mocked(prisma.user.findUnique).mockImplementation((async (args: { where: Where }) => find(args.where)) as never)
  vi.mocked(prisma.user.update).mockImplementation((async (args: { where: { id: string }; data: Partial<Row> }) => {
    const row = users.find((u) => u.id === args.where.id)!
    Object.assign(row, args.data)
    return row
  }) as never)
  vi.mocked(prisma.user.create).mockImplementation((async (args: { data: Partial<Row> & { email: string } }) => {
    const row = user({ id: `u${users.length + 1}`, ...args.data })
    users.push(row)
    return row
  }) as never)
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('a new person', () => {
  it('is created bound to the provider identity', async () => {
    const result = await upsertUserFromClaims({ sub: 'acc-1', email: 'Ana@Example.com', iss: ACCORD })
    expect(result).toMatchObject({ email: 'ana@example.com', created: true, platformSub: 'acc-1' })
    expect(vi.mocked(prisma.user.create).mock.calls[0][0]).toMatchObject({
      data: { email: 'ana@example.com', platformIssuer: ACCORD, platformSub: 'acc-1' },
    })
  })

  it('is created unbound when the claims carry no issuer', async () => {
    await upsertUserFromClaims({ sub: 'acc-1', email: 'ana@example.com' })
    const data = vi.mocked(prisma.user.create).mock.calls[0][0].data as Record<string, unknown>
    expect(data.platformIssuer).toBeUndefined()
    expect(data.platformSub).toBeUndefined()
  })
})

describe('an existing person not bound yet', () => {
  it('is matched by email and bound, once', async () => {
    users.push(user({ id: 'ana', email: 'ana@example.com' }))

    const first = await upsertUserFromClaims({ sub: 'acc-1', email: 'ana@example.com', iss: ACCORD })
    expect(first).toMatchObject({ userId: 'ana', created: false })
    expect(users[0]).toMatchObject({ platformIssuer: ACCORD, platformSub: 'acc-1' })
    expect(audits()).toEqual([
      { action: 'identity.linked', targetUserId: 'ana', detail: { issuer: ACCORD, subject: 'acc-1' } },
    ])

    vi.clearAllMocks()
    await upsertUserFromClaims({ sub: 'acc-1', email: 'ana@example.com', iss: ACCORD })
    expect(prisma.user.update).not.toHaveBeenCalled()
    expect(audits()).toEqual([])
  })

  it('is matched by email and left unbound when the claims carry no issuer', async () => {
    users.push(user({ id: 'ana', email: 'ana@example.com' }))
    await expect(upsertUserFromClaims({ sub: 'acc-1', email: 'ana@example.com' })).resolves.toMatchObject({
      userId: 'ana',
    })
    expect(users[0].platformSub).toBeNull()
    expect(prisma.user.update).not.toHaveBeenCalled()
  })

  it('bound to another provider is rebound, which is how a self-hosted instance changes provider', async () => {
    users.push(user({ id: 'ana', email: 'ana@example.com', platformIssuer: OTHER_IDP, platformSub: 'old-1' }))
    await expect(upsertUserFromClaims({ sub: 'acc-1', email: 'ana@example.com', iss: ACCORD })).resolves.toMatchObject({
      userId: 'ana',
    })
    expect(users[0]).toMatchObject({ platformIssuer: ACCORD, platformSub: 'acc-1' })
    expect(audits()).toEqual([
      {
        action: 'identity.linked',
        targetUserId: 'ana',
        detail: { issuer: ACCORD, subject: 'acc-1', previousIssuer: OTHER_IDP },
      },
    ])
  })
})

describe('a bound person', () => {
  beforeEach(() => {
    users.push(user({ id: 'ana', email: 'ana@example.com', platformIssuer: ACCORD, platformSub: 'acc-1' }))
  })

  it('whose email changed at the provider keeps their account, and the stored email follows', async () => {
    const result = await upsertUserFromClaims({ sub: 'acc-1', email: 'ana.new@example.com', iss: ACCORD })
    expect(result).toMatchObject({ userId: 'ana', email: 'ana.new@example.com', created: false })
    expect(users).toHaveLength(1)
    expect(users[0].email).toBe('ana.new@example.com')
    expect(audits()).toEqual([
      {
        action: 'user.email_changed',
        targetUserId: 'ana',
        detail: { from: 'ana@example.com', to: 'ana.new@example.com', source: 'identity_provider' },
      },
    ])
  })

  it('is checked against VERBA_OPERATORS by the new address', async () => {
    vi.stubEnv('VERBA_OPERATORS', 'ana.new@example.com')
    vi.mocked(prisma.account.count).mockResolvedValue(1)
    await upsertUserFromClaims({ sub: 'acc-1', email: 'ana.new@example.com', iss: ACCORD })
    expect(prisma.account.count).toHaveBeenCalled()
  })

  it('whose new email is held by another user signs in as themselves and keeps the stored email', async () => {
    users.push(user({ id: 'bo', email: 'shared@example.com' }))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const result = await upsertUserFromClaims({ sub: 'acc-1', email: 'shared@example.com', iss: ACCORD })
    expect(result).toMatchObject({ userId: 'ana', email: 'ana@example.com' })
    expect(users.find((u) => u.id === 'ana')!.email).toBe('ana@example.com')
    expect(users.find((u) => u.id === 'bo')!.platformSub).toBeNull()
    expect(prisma.user.update).not.toHaveBeenCalled()
    expect(audits()).toEqual([])
    expect(warn).toHaveBeenCalled()
  })

  it('who was deactivated is refused, whatever the email says', async () => {
    users[0].deactivatedAt = new Date()
    await expect(upsertUserFromClaims({ sub: 'acc-1', email: 'ana.new@example.com', iss: ACCORD })).resolves.toBeNull()
    expect(users[0].email).toBe('ana@example.com')
    expect(prisma.user.update).not.toHaveBeenCalled()
  })

  it('refreshes the avatar and role in the same write as nothing else', async () => {
    await upsertUserFromClaims({ sub: 'acc-1', email: 'ana@example.com', iss: ACCORD, role: 'admin' })
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'ana' },
      data: { avatarUrl: null, platformRole: 'admin' },
    })
  })
})

describe('an address whose account is bound to another subject at the same provider', () => {
  beforeEach(() => {
    users.push(user({ id: 'ana', email: 'ana@example.com', platformIssuer: ACCORD, platformSub: 'acc-1' }))
  })

  it('is refused with 409 account_linked_elsewhere, and nothing is rebound', async () => {
    await expect(upsertUserFromClaims({ sub: 'acc-2', email: 'ana@example.com', iss: ACCORD })).rejects.toMatchObject({
      statusCode: 409,
      details: { code: 'account_linked_elsewhere' },
    })
    expect(users[0]).toMatchObject({ platformSub: 'acc-1', email: 'ana@example.com' })
    expect(prisma.user.update).not.toHaveBeenCalled()
    expect(prisma.user.create).not.toHaveBeenCalled()
    expect(audits()).toEqual([
      {
        action: 'identity.link_refused',
        targetUserId: 'ana',
        detail: { issuer: ACCORD, subject: 'acc-2', boundSubject: 'acc-1' },
      },
    ])
  })

  it('answers not-a-member, as for anyone else, when that account is deactivated', async () => {
    users[0].deactivatedAt = new Date()
    await expect(upsertUserFromClaims({ sub: 'acc-2', email: 'ana@example.com', iss: ACCORD })).resolves.toBeNull()
    expect(audits()).toEqual([])
  })
})
