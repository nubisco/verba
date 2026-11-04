import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Plan limits on creation: refused with 402 plan_limit past a hosted plan's
// limit, and nothing at all on an instance without hosted plans. The limits
// come from EE (mocked here, tested in packages/ee/src/plans), the counts
// from Prisma (mocked).

vi.mock('../prisma.js', () => ({
  prisma: {
    project: { count: vi.fn(), findUnique: vi.fn(), create: vi.fn() },
    accountMember: { count: vi.fn(), findUnique: vi.fn(), create: vi.fn() },
    key: { count: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn() },
    namespace: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
    locale: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn() },
    membership: { count: vi.fn() },
    user: { findUnique: vi.fn() },
    instanceAuditLog: { create: vi.fn() },
  },
}))

const accountLimits = vi.fn()
// Checkout open unless a test closes it (VERBA_CHECKOUT_OPEN).
let checkoutOpen = true
vi.mock('@nubisco/verba-ee', () => ({
  accountLimits: (...args: unknown[]) => accountLimits(...args),
  plansConfig: () => ({ checkoutOpen }),
}))

import { prisma } from '../prisma.js'
import { assertWithinLimit, newKeyCount, planLimitMessage } from '../services/plan-limits.service.js'
import { createProject } from '../services/project.service.js'
import { addMember } from '../services/account.service.js'
import { createKey } from '../services/key.service.js'
import { prepareTabularImport } from '../services/import.service.js'
import { prepareXliffImport } from '../services/xliff.service.js'
import { createLocale } from '../services/locale.service.js'

const PRO = { projects: 10, members: 25, keys: 15000 }

beforeEach(() => {
  vi.clearAllMocks()
  accountLimits.mockResolvedValue(PRO)
  vi.mocked(prisma.project.count).mockResolvedValue(3)
  vi.mocked(prisma.accountMember.count).mockResolvedValue(4)
  vi.mocked(prisma.key.count).mockResolvedValue(100)
  vi.mocked(prisma.project.findUnique).mockResolvedValue({ accountId: 'acc1' } as never)
  // The project's namespaces, read with its keys (key-index.service.ts).
  vi.mocked(prisma.namespace.findMany).mockResolvedValue([
    { id: 'ns-default', slug: 'default' },
    { id: 'ns-web', slug: 'web' },
  ] as never)
})

afterEach(() => vi.unstubAllEnvs())

describe('on an instance without hosted plans', () => {
  it('refuses nothing and counts nothing, with EE off even when licenses is configured', async () => {
    vi.stubEnv('VERBA_LICENSES_URL', 'https://licenses.test')
    vi.stubEnv('VERBA_LICENSES_SERVICE_TOKEN', 'svc')
    vi.mocked(prisma.project.count).mockResolvedValue(9999)
    await expect(assertWithinLimit('acc1', 'projects', 5000)).resolves.toBeUndefined()
    expect(accountLimits).not.toHaveBeenCalled()
    expect(prisma.project.count).not.toHaveBeenCalled()
  })

  it('refuses nothing with EE on when EE reports no hosted plan', async () => {
    vi.stubEnv('ENABLE_EE', 'true')
    accountLimits.mockResolvedValue(null)
    await expect(assertWithinLimit('acc1', 'keys', 1)).resolves.toBeUndefined()
    expect(prisma.key.count).not.toHaveBeenCalled()
  })

  it('refuses nothing under OSS_ONLY, whatever ENABLE_EE says', async () => {
    vi.stubEnv('ENABLE_EE', 'true')
    vi.stubEnv('OSS_ONLY', 'true')
    await expect(assertWithinLimit('acc1', 'projects')).resolves.toBeUndefined()
    expect(accountLimits).not.toHaveBeenCalled()
  })
})

describe('on a hosted plan', () => {
  beforeEach(() => vi.stubEnv('ENABLE_EE', 'true'))

  it('allows up to the limit and refuses past it with plan_limit', async () => {
    vi.mocked(prisma.project.count).mockResolvedValue(9)
    await expect(assertWithinLimit('acc1', 'projects')).resolves.toBeUndefined()
    vi.mocked(prisma.project.count).mockResolvedValue(10)
    await expect(assertWithinLimit('acc1', 'projects')).rejects.toMatchObject({
      statusCode: 402,
      message: "This account's plan allows 10 projects, and it has 10. Upgrade the plan to add more.",
      details: { code: 'plan_limit', resource: 'projects', limit: 10, current: 10, adding: 1 },
    })
  })

  it('points at sales, not an upgrade, while checkout is closed', async () => {
    checkoutOpen = false
    vi.mocked(prisma.project.count).mockResolvedValue(10)
    await expect(assertWithinLimit('acc1', 'projects')).rejects.toMatchObject({
      statusCode: 402,
      message: "This account's plan allows 10 projects, and it has 10. Contact sales to raise the limit.",
      details: { code: 'plan_limit', resource: 'projects' },
    })
    checkoutOpen = true
  })

  it('counts what a change adds, not only one', async () => {
    vi.mocked(prisma.key.count).mockResolvedValue(14990)
    await expect(assertWithinLimit('acc1', 'keys', 10)).resolves.toBeUndefined()
    await expect(assertWithinLimit('acc1', 'keys', 11)).rejects.toMatchObject({
      statusCode: 402,
      details: { resource: 'keys', limit: 15000, current: 14990, adding: 11 },
    })
  })

  it('treats a null limit as unlimited', async () => {
    accountLimits.mockResolvedValue({ ...PRO, members: null })
    vi.mocked(prisma.accountMember.count).mockResolvedValue(10_000)
    await expect(assertWithinLimit('acc1', 'members')).resolves.toBeUndefined()
  })

  it('words the refusal for people', () => {
    expect(planLimitMessage('keys', 15000, 14990, 40)).toBe(
      "This account's plan allows 15,000 translation keys, and it has 14,990. This would add 40 more. Upgrade the plan to add more.",
    )
    expect(planLimitMessage('members', 1, 1, 1)).toMatch(/^This account's plan allows 1 member,/)
  })
})

describe('the create paths', () => {
  beforeEach(() => {
    vi.stubEnv('ENABLE_EE', 'true')
    accountLimits.mockResolvedValue({ projects: 3, members: 5, keys: 100 })
  })

  it('refuses a project past the account limit', async () => {
    vi.mocked(prisma.project.count).mockResolvedValue(3)
    await expect(createProject('acc1', { name: 'X', slug: 'x' })).rejects.toMatchObject({
      statusCode: 402,
      details: { resource: 'projects' },
    })
    expect(prisma.project.create).not.toHaveBeenCalled()
  })

  it('limits nothing without hosted plans: there is no per-person cap any more', async () => {
    accountLimits.mockResolvedValue(null)
    vi.mocked(prisma.membership.count).mockResolvedValue(500)
    vi.mocked(prisma.project.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.project.create).mockResolvedValue({ id: 'p9', slug: 'x', accountId: 'acc1' } as never)
    await expect(createProject('acc1', { name: 'X', slug: 'x' })).resolves.toBeDefined()
    expect(prisma.membership.count).not.toHaveBeenCalled()
    expect(prisma.project.count).not.toHaveBeenCalled()
  })

  it('refuses adding a person to a full account', async () => {
    vi.mocked(prisma.accountMember.findUnique)
      .mockResolvedValueOnce({ role: 'ADMIN' } as never) // the actor
      .mockResolvedValueOnce(null) // not a member yet
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'u2', deactivatedAt: null } as never)
    vi.mocked(prisma.accountMember.count).mockResolvedValue(5)
    await expect(addMember('u1', 'acc1', { email: 'b@example.com', role: 'MEMBER' })).rejects.toMatchObject({
      statusCode: 402,
      details: { resource: 'members', limit: 5 },
    })
    expect(prisma.accountMember.create).not.toHaveBeenCalled()
  })

  it('refuses a key past the account limit', async () => {
    vi.mocked(prisma.namespace.findFirst).mockResolvedValue({ id: 'ns1' } as never)
    vi.mocked(prisma.key.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.key.count).mockResolvedValue(100)
    await expect(createKey('p1', { namespaceId: 'ns1', name: 'a.b' } as never)).rejects.toMatchObject({
      statusCode: 402,
      details: { resource: 'keys' },
    })
    expect(prisma.key.create).not.toHaveBeenCalled()
  })

  it('refuses an import before it writes anything, counting only the keys it would create', async () => {
    vi.mocked(prisma.key.count).mockResolvedValue(99)
    // a.one already exists in the default namespace: an update, not a new key.
    vi.mocked(prisma.key.findMany).mockResolvedValue([{ id: 'k1', name: 'a.one', namespaceId: 'ns-default' }] as never)
    const rows = [
      { keyName: 'a.one', translations: {} },
      { keyName: 'a.two', translations: {} },
      { keyName: 'a.three', translations: {} },
      { keyName: 'a.three', translations: {} },
    ]
    await expect(prepareTabularImport('p1', rows as never)).rejects.toMatchObject({
      statusCode: 402,
      details: { resource: 'keys', current: 99, adding: 2 },
    })
    expect(prisma.locale.findMany).not.toHaveBeenCalled()
    expect(prisma.key.create).not.toHaveBeenCalled()
  })
})

describe('an XLIFF import on a hosted plan', () => {
  it('is refused before it writes anything when its new keys do not fit', async () => {
    vi.stubEnv('ENABLE_EE', 'true')
    accountLimits.mockResolvedValue({ projects: 3, members: 5, keys: 100 })
    vi.mocked(prisma.key.count).mockResolvedValue(100)
    vi.mocked(prisma.key.findMany).mockResolvedValue([])
    const doc = Buffer.from(
      '<?xml version="1.0" encoding="UTF-8"?>\n<xliff version="1.2"><file original="app" source-language="en" target-language="pt"><body>' +
        '<trans-unit id="a.one"><source>One</source></trans-unit></body></file></xliff>',
    )
    await expect(prepareXliffImport('p1', doc)).rejects.toMatchObject({
      statusCode: 402,
      details: { resource: 'keys', adding: 1 },
    })
    expect(prisma.key.create).not.toHaveBeenCalled()
  })
})

describe('locales on a hosted plan (distinct codes across the account)', () => {
  beforeEach(() => {
    vi.stubEnv('ENABLE_EE', 'true')
    accountLimits.mockResolvedValue({ projects: 3, members: 5, keys: 1500, locales: 5 })
    vi.mocked(prisma.locale.findUnique).mockResolvedValue(null)
    // The account's projects translate into five codes already.
    vi.mocked(prisma.locale.findMany).mockResolvedValue(
      ['en', 'pt-PT', 'fr', 'de', 'es'].map((code) => ({ code })) as never,
    )
  })

  it('refuses a sixth locale', async () => {
    await expect(createLocale('p1', { code: 'it', name: 'Italian' } as never)).rejects.toMatchObject({
      statusCode: 402,
      message: "This account's plan allows 5 locales, and it has 5. Upgrade the plan to add more.",
      details: { code: 'plan_limit', resource: 'locales', limit: 5, current: 5, adding: 1 },
    })
    expect(prisma.locale.create).not.toHaveBeenCalled()
  })

  it('allows a code another project in the account already has: it adds no locale', async () => {
    vi.mocked(prisma.locale.create).mockResolvedValue({ id: 'l9', code: 'fr' } as never)
    await expect(createLocale('p1', { code: 'fr', name: 'French' } as never)).resolves.toBeDefined()
  })

  it('refuses an XLIFF import whose new locales do not fit, before writing anything', async () => {
    vi.mocked(prisma.key.findMany).mockResolvedValue([])
    vi.mocked(prisma.key.count).mockResolvedValue(0)
    const doc = Buffer.from(
      '<?xml version="1.0" encoding="UTF-8"?>\n<xliff version="1.2"><file original="app" source-language="en" target-language="ja"><body>' +
        '<trans-unit id="a.one"><source>One</source></trans-unit></body></file></xliff>',
    )
    await expect(prepareXliffImport('p1', doc)).rejects.toMatchObject({
      statusCode: 402,
      details: { resource: 'locales', adding: 1 },
    })
    expect(prisma.key.create).not.toHaveBeenCalled()
  })

  it('counts nothing without hosted plans', async () => {
    vi.stubEnv('ENABLE_EE', '')
    vi.mocked(prisma.locale.create).mockResolvedValue({ id: 'l9', code: 'it' } as never)
    await expect(createLocale('p1', { code: 'it', name: 'Italian' } as never)).resolves.toBeDefined()
    expect(prisma.locale.findMany).not.toHaveBeenCalled()
  })
})

describe('newKeyCount', () => {
  it('counts each missing namespace and name once', async () => {
    vi.mocked(prisma.key.findMany).mockResolvedValue([{ id: 'k1', name: 'x', namespaceId: 'ns-web' }] as never)
    const n = await newKeyCount('p1', [
      { namespaceSlug: 'web', name: 'x' },
      { namespaceSlug: 'app', name: 'x' },
      { namespaceSlug: 'app', name: 'x' },
      { namespaceSlug: 'web', name: 'y' },
    ])
    expect(n).toBe(2)
  })
})
