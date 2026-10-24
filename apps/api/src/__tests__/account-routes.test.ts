import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Two accounts, A and B. The caller is in A only. Nothing they send reaches
// B's projects: not naming B, not asking for a B project by id, not its
// members.

vi.mock('../prisma.js', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    accountMember: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
    account: { findUnique: vi.fn(), create: vi.fn() },
    membership: { findFirst: vi.fn() },
    project: { findMany: vi.fn(), findUnique: vi.fn() },
    instanceAuditLog: { create: vi.fn() },
  },
}))

vi.mock('../services/analytics.service.js', () => ({ track: vi.fn() }))

import { buildApp } from '../app.js'
import { prisma } from '../prisma.js'

const ACCOUNT_A = { id: 'acc-a', name: 'A', slug: 'a', createdAt: new Date() }
const ACCOUNT_B = { id: 'acc-b', name: 'B', slug: 'b', createdAt: new Date() }

describe('one account cannot reach another', () => {
  let app: ReturnType<typeof buildApp>
  let cookies: Record<string, string>

  beforeEach(async () => {
    vi.clearAllMocks()
    vi.stubEnv('JWT_SECRET', 'test-secret')
    app = buildApp()
    await app.ready()
    cookies = { token: app.jwt.sign({ userId: 'u-a', email: 'a@example.com' }) }
    // The caller is a member of A and of nothing in B.
    vi.mocked(prisma.accountMember.findFirst).mockImplementation((async (args: {
      where: { account: { OR: Array<{ id?: string; slug?: string }> } }
    }) => {
      const names = args.where.account.OR.map((o) => o.id ?? o.slug)
      return names.includes('acc-a') || names.includes('a') ? { role: 'MEMBER', account: ACCOUNT_A } : null
    }) as never)
    vi.mocked(prisma.accountMember.findMany).mockResolvedValue([{ role: 'MEMBER', account: ACCOUNT_A }] as never)
    vi.mocked(prisma.accountMember.findUnique).mockImplementation((async (args: {
      where: { userId_accountId: { accountId: string } }
    }) => (args.where.userId_accountId.accountId === 'acc-a' ? { role: 'MEMBER' } : null)) as never)
    vi.mocked(prisma.project.findMany).mockResolvedValue([])
  })

  afterEach(async () => {
    await app.close()
    vi.unstubAllEnvs()
  })

  it("lists A's projects when the request names no account and the person is only in A", async () => {
    const res = await app.inject({ method: 'GET', url: '/projects', cookies })
    expect(res.statusCode).toBe(200)
    expect(prisma.project.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { accountId: 'acc-a', memberships: { some: { userId: 'u-a' } } } }),
    )
  })

  it("answers 404 to a request that names B, and never queries B's projects", async () => {
    const res = await app.inject({ method: 'GET', url: '/projects', cookies, headers: { 'x-verba-account': 'acc-b' } })
    expect(res.statusCode).toBe(404)
    expect(prisma.project.findMany).not.toHaveBeenCalled()
  })

  it('accepts the account as a query parameter too', async () => {
    const res = await app.inject({ method: 'GET', url: '/projects?account=b', cookies })
    expect(res.statusCode).toBe(404)
    const ok = await app.inject({ method: 'GET', url: '/projects?account=a', cookies })
    expect(ok.statusCode).toBe(200)
  })

  it("refuses a B project asked for by id: the membership lookup requires the project's account", async () => {
    vi.mocked(prisma.membership.findFirst).mockResolvedValue(null)
    const res = await app.inject({ method: 'GET', url: '/projects/p-of-b', cookies })
    expect(res.statusCode).toBe(403)
    expect(prisma.membership.findFirst).toHaveBeenCalledWith({
      where: { userId: 'u-a', projectId: 'p-of-b', project: { account: { members: { some: { userId: 'u-a' } } } } },
    })
    expect(prisma.project.findUnique).not.toHaveBeenCalled()
  })

  it('does not show B or its members to someone outside it', async () => {
    const res = await app.inject({ method: 'GET', url: '/accounts/acc-b', cookies })
    expect(res.statusCode).toBe(404)
    const members = await app.inject({ method: 'GET', url: '/accounts/acc-b/members', cookies })
    expect(members.statusCode).toBe(404)
  })

  it('asks a person in two accounts to name one, listing both', async () => {
    vi.mocked(prisma.accountMember.findMany).mockResolvedValue([
      { role: 'MEMBER', account: ACCOUNT_A },
      { role: 'MEMBER', account: ACCOUNT_B },
    ] as never)
    const res = await app.inject({ method: 'GET', url: '/projects', cookies })
    expect(res.statusCode).toBe(400)
    expect(res.json().accounts.map((a: { id: string }) => a.id)).toEqual(['acc-a', 'acc-b'])
  })

  it('refuses to create an account for someone Platform does not mark as admin', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      platformRole: 'user',
      deactivatedAt: null,
      email: 'a@example.com',
    } as never)
    const res = await app.inject({ method: 'POST', url: '/accounts', cookies, payload: { name: 'Mine' } })
    expect(res.statusCode).toBe(403)
    expect(prisma.account.create).not.toHaveBeenCalled()
  })
})
