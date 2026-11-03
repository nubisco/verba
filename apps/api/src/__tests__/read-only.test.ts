import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// An account over its hosted plan is read-only, through the real app: writes
// are refused with 402 plan_limit and readOnly, deleting and removing people
// still work, reading works, and the account is writable again as soon as it
// is back under. Without hosted plans nothing changes. The limits come from EE
// (mocked here), the counts from Prisma (mocked).

vi.mock('../prisma.js', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    project: { count: vi.fn(), findUnique: vi.fn() },
    accountMember: { count: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
    key: { count: vi.fn() },
    locale: { findMany: vi.fn() },
    membership: { findFirst: vi.fn() },
    instanceAuditLog: { create: vi.fn() },
  },
}))

vi.mock('../services/analytics.service.js', () => ({ track: vi.fn() }))

const accountLimits = vi.fn()
vi.mock('@nubisco/verba-ee', () => ({
  accountLimits: (...args: unknown[]) => accountLimits(...args),
  // Hosted billing's routes are tested in billing-routes.test.ts.
  plansPlugin: undefined,
  plansConfig: undefined,
}))

import type { RouteOptions } from 'fastify'
import { buildApp } from '../app.js'
import { prisma } from '../prisma.js'
import { guardReadOnlyWrites } from '../read-only.js'

const ACCOUNT = { id: 'acc1', name: 'Example', slug: 'example', createdAt: new Date() }

let app: ReturnType<typeof buildApp>
let cookies: Record<string, string>

beforeEach(async () => {
  vi.clearAllMocks()
  vi.stubEnv('JWT_SECRET', 'test-secret')
  vi.stubEnv('ENABLE_EE', 'true')
  // Free after a downgrade: 1 project allowed, the account has 2.
  accountLimits.mockResolvedValue({ projects: 1, members: 5, keys: 1000 })
  vi.mocked(prisma.project.count).mockResolvedValue(2)
  vi.mocked(prisma.accountMember.count).mockResolvedValue(3)
  vi.mocked(prisma.key.count).mockResolvedValue(10)
  vi.mocked(prisma.locale.findMany).mockResolvedValue([{ code: 'en' }] as never)
  vi.mocked(prisma.project.findUnique).mockResolvedValue({ accountId: 'acc1' } as never)
  // The caller is an owner of acc1 and a member of its project p1, and of nothing else.
  vi.mocked(prisma.accountMember.findUnique).mockImplementation((async (args: {
    where: { userId_accountId: { accountId: string } }
  }) => (args.where.userId_accountId.accountId === 'acc1' ? { role: 'OWNER' } : null)) as never)
  vi.mocked(prisma.accountMember.findFirst).mockResolvedValue({ role: 'OWNER', account: ACCOUNT } as never)
  vi.mocked(prisma.membership.findFirst).mockImplementation((async (args: { where: { projectId: string } }) =>
    args.where.projectId === 'p1' ? { role: 'ADMIN', namespaces: null, assignedLocales: null } : null) as never)
  app = buildApp()
  await app.ready()
  cookies = { token: app.jwt.sign({ userId: 'u1', email: 'owner@example.com' }) }
})

afterEach(async () => {
  await app.close()
  vi.unstubAllEnvs()
})

const write = (method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, payload: unknown = {}) =>
  app.inject({ method, url, cookies, payload: payload as never, headers: { 'x-verba-account': 'acc1' } })

/** Writes in the account, one of each kind the decision names. */
const BLOCKED: [string, 'POST' | 'PUT' | 'PATCH', string][] = [
  ['creating a project', 'POST', '/projects'],
  ['creating a key', 'POST', '/projects/p1/keys'],
  ['editing a key', 'PATCH', '/projects/p1/keys/k1'],
  ['importing', 'POST', '/projects/p1/import/apply'],
  ['translating', 'PUT', '/projects/p1/keys/k1/translations/l1'],
  ['approving', 'PATCH', '/projects/p1/translations/t1/status'],
  ['commenting', 'POST', '/projects/p1/translations/t1/comments'],
  ['AI translating', 'POST', '/projects/p1/ai/fill-locale'],
  ['editing the project', 'PATCH', '/projects/p1'],
  ['renaming the account', 'PATCH', '/accounts/acc1'],
  ['adding a person', 'POST', '/accounts/acc1/members'],
]

describe('an account over its hosted plan', () => {
  it.each(BLOCKED)('refuses %s with 402 plan_limit, saying which limit', async (_what, method, url) => {
    const res = await write(method, url)
    expect(res.statusCode).toBe(402)
    expect(res.json()).toMatchObject({
      code: 'plan_limit',
      readOnly: true,
      resource: 'projects',
      limit: 1,
      current: 2,
      over: [{ resource: 'projects', limit: 1, current: 2 }],
    })
    expect(res.json().error).toBe(
      'This account is read-only. It has 2 projects, and the plan allows 1. Nothing was deleted, and everyone can still read and export. Delete some, or upgrade the plan, to make changes again.',
    )
  })

  it('names every limit it is over', async () => {
    vi.mocked(prisma.accountMember.count).mockResolvedValue(8)
    const res = await write('POST', '/projects/p1/keys')
    expect(res.json().error).toContain('It has 2 projects and 8 members, and the plan allows 1 project and 5 members.')
  })

  it('counts locales too: over 5 distinct locales makes it read-only', async () => {
    vi.mocked(prisma.project.count).mockResolvedValue(1)
    accountLimits.mockResolvedValue({ projects: 3, members: 5, keys: 1500, locales: 5 })
    vi.mocked(prisma.locale.findMany).mockResolvedValue(
      ['en', 'pt-PT', 'fr', 'de', 'es', 'it'].map((code) => ({ code })) as never,
    )
    const res = await write('POST', '/projects/p1/keys')
    expect(res.statusCode).toBe(402)
    expect(res.json()).toMatchObject({ readOnly: true, over: [{ resource: 'locales', limit: 5, current: 6 }] })
    expect(res.json().error).toContain('It has 6 locales, and the plan allows 5.')
    // Deleting a locale is how it gets back under.
    expect((await write('DELETE', '/projects/p1/locales/l6')).statusCode).not.toBe(402)
  })

  it('still lets people delete and be removed, which is how it gets back under', async () => {
    for (const url of [
      '/projects/p1',
      '/projects/p1/keys/k1',
      '/projects/p1/members/u2',
      '/accounts/acc1/members/u2',
    ]) {
      const res = await write('DELETE', url)
      expect(res.statusCode, url).not.toBe(402)
    }
  })

  it('still reads, and says why it is read-only to any member', async () => {
    const res = await app.inject({ method: 'GET', url: '/accounts/acc1/plan-status', cookies })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({
      readOnly: true,
      over: [{ resource: 'projects', limit: 1, current: 2 }],
      summary: 'It has 2 projects, and the plan allows 1.',
    })
  })

  it('becomes writable again once it is back under every limit', async () => {
    vi.mocked(prisma.project.count).mockResolvedValue(1)
    const res = await write('POST', '/projects/p1/translations/t1/comments')
    expect(res.statusCode).not.toBe(402)
    const status = await app.inject({ method: 'GET', url: '/accounts/acc1/plan-status', cookies })
    expect(status.json().readOnly).toBe(false)
  })

  it('becomes writable again when the plan is upgraded', async () => {
    accountLimits.mockResolvedValue({ projects: 10, members: 25, keys: 15000 })
    expect((await write('PATCH', '/projects/p1/keys/k1')).statusCode).not.toBe(402)
  })

  it('tells someone outside the account nothing: they get the route’s own answer', async () => {
    const res = await write('POST', '/projects/p-other/keys')
    expect(res.statusCode).not.toBe(402)
    expect(prisma.project.count).not.toHaveBeenCalled()
  })

  it('keeps billing and import preview open', () => {
    const noop = async () => {}
    for (const url of [
      '/accounts/:accountId/billing/checkout',
      '/accounts/:accountId/billing/portal',
      '/billing/entitlement',
      '/projects/:projectId/import/preview',
    ]) {
      const route = { method: 'POST', url, preHandler: [noop], handler: noop } as unknown as RouteOptions
      guardReadOnlyWrites(route)
      expect(route.preHandler, url).toEqual([noop])
    }
    const guarded = { method: 'POST', url: '/projects/:projectId/keys', handler: noop } as unknown as RouteOptions
    guardReadOnlyWrites(guarded)
    expect(([] as unknown[]).concat(guarded.preHandler)).toHaveLength(1)
  })
})

describe('without hosted plans', () => {
  it('refuses nothing and counts nothing, with EE off', async () => {
    vi.stubEnv('ENABLE_EE', '')
    for (const [, method, url] of BLOCKED) {
      const res = await write(method, url)
      expect(res.statusCode, url).not.toBe(402)
    }
    expect(prisma.project.count).not.toHaveBeenCalled()
    expect(accountLimits).not.toHaveBeenCalled()
  })

  it('refuses nothing with EE on but no hosted plan', async () => {
    accountLimits.mockResolvedValue(null)
    expect((await write('POST', '/projects/p1/keys')).statusCode).not.toBe(402)
    const status = await app.inject({ method: 'GET', url: '/accounts/acc1/plan-status', cookies })
    expect(status.json()).toEqual({ readOnly: false, over: [], summary: null })
  })
})
