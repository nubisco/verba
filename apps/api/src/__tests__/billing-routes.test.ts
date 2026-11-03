import { createHmac } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Hosted billing through the real app: off unless EE is enabled and the
// licenses service is configured, and then mounted with the API's own account
// checks. The plans logic itself is tested in packages/ee/src/plans.

vi.mock('../prisma.js', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    accountMember: { findUnique: vi.fn(), count: vi.fn() },
    account: { findUnique: vi.fn() },
    accountPlan: { findUnique: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
    project: { count: vi.fn() },
    key: { count: vi.fn() },
    locale: { findMany: vi.fn() },
    entitlementOverride: { findUnique: vi.fn() },
    licenseState: { findFirst: vi.fn() },
  },
}))

vi.mock('../services/analytics.service.js', () => ({ track: vi.fn() }))

import { buildApp } from '../app.js'
import { inject, signToken } from './inject.js'
import { prisma } from '../prisma.js'

const SECRET = 'hook-secret'
const PRO = {
  app: 'verba',
  workspace_id: 'acc-a',
  plan: 'pro',
  state: 'active',
  source: 'subscription',
  limits: { projects: 10, keys: 15000, members: 25, locales: null },
  subscription: null,
  override: null,
  version: 3,
  computed_at: '2026-11-03T00:00:00Z',
}

let app: Awaited<ReturnType<typeof buildApp>>
let cookies: Record<string, string>
let licensesCalls: string[]

async function start() {
  app = await buildApp()
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('JWT_SECRET', 'test-secret')
  licensesCalls = []
  // u-admin is an ADMIN of acc-a, u-member a MEMBER.
  vi.mocked(prisma.accountMember.findUnique).mockImplementation((async (args: {
    where: { userId_accountId: { userId: string; accountId: string } }
  }) => {
    const { userId, accountId } = args.where.userId_accountId
    if (accountId !== 'acc-a') return null
    return userId === 'u-admin' ? { role: 'ADMIN' } : userId === 'u-member' ? { role: 'MEMBER' } : null
  }) as never)
  vi.mocked(prisma.account.findUnique).mockResolvedValue({ id: 'acc-a' } as never)
  // AccountPlan keeps what is written to it, so a fetch is read back.
  let held: Record<string, unknown> | null = null
  vi.mocked(prisma.accountPlan.findUnique).mockImplementation((async () => held) as never)
  vi.mocked(prisma.accountPlan.create).mockImplementation((async (args: { data: Record<string, unknown> }) => {
    held = args.data
    return held
  }) as never)
  vi.mocked(prisma.project.count).mockResolvedValue(2)
  vi.mocked(prisma.accountMember.count).mockResolvedValue(4)
  vi.mocked(prisma.key.count).mockResolvedValue(120)
  vi.mocked(prisma.locale.findMany).mockResolvedValue([{ code: 'en' }, { code: 'pt' }] as never)
  vi.stubGlobal('fetch', (async (input: string) => {
    licensesCalls.push(String(input))
    return new Response(JSON.stringify(PRO), { status: 200, headers: { 'content-type': 'application/json' } })
  }) as typeof fetch)
})

afterEach(async () => {
  // The plans config is module state in EE, set when the plugin mounts. Typed
  // loosely because the Community image compiles against a stub EE index.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;((await import('@nubisco/verba-ee')) as any).configurePlans(null)
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

function signed(body: unknown) {
  const payload = JSON.stringify(body)
  return {
    payload,
    headers: {
      'content-type': 'application/json',
      'x-nubisco-signature': `sha256=${createHmac('sha256', SECRET).update(payload).digest('hex')}`,
    },
  }
}

describe('an instance that does not sell plans', () => {
  it('has no billing routes and says so in /config, with EE off', async () => {
    vi.stubEnv('VERBA_LICENSES_URL', 'https://licenses.test')
    vi.stubEnv('VERBA_LICENSES_SERVICE_TOKEN', 'svc')
    await start()
    cookies = { token: await signToken({ userId: 'u-admin', email: 'a@example.com' }) }
    const config = await inject(app, { method: 'GET', url: '/config' })
    expect(config.json().features.billing).toBe(false)
    expect((await inject(app, { method: 'GET', url: '/accounts/acc-a/billing', cookies })).statusCode).toBe(404)
    expect((await inject(app, { method: 'POST', url: '/billing/entitlement', ...signed({}) })).statusCode).toBe(404)
    expect(licensesCalls).toHaveLength(0)
  })

  it('has none with EE on but the licenses service not configured', async () => {
    vi.stubEnv('ENABLE_EE', 'true')
    await start()
    cookies = { token: await signToken({ userId: 'u-admin', email: 'a@example.com' }) }
    expect((await inject(app, { method: 'GET', url: '/config' })).json().features.billing).toBe(false)
    expect((await inject(app, { method: 'GET', url: '/accounts/acc-a/billing', cookies })).statusCode).toBe(404)
  })
})

describe('an instance that sells plans', () => {
  beforeEach(async () => {
    vi.stubEnv('ENABLE_EE', 'true')
    vi.stubEnv('VERBA_LICENSES_URL', 'https://licenses.test')
    vi.stubEnv('VERBA_LICENSES_SERVICE_TOKEN', 'svc')
    vi.stubEnv('VERBA_ENTITLEMENT_WEBHOOK_SECRET', SECRET)
    await start()
  })

  it('reports billing in /config', async () => {
    expect((await inject(app, { method: 'GET', url: '/config' })).json().features.billing).toBe(true)
  })

  it('shows an account admin the plan from licenses and the usage counted here', async () => {
    cookies = { token: await signToken({ userId: 'u-admin', email: 'a@example.com' }) }
    const res = await inject(app, { method: 'GET', url: '/accounts/acc-a/billing', cookies })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({
      plan: 'pro',
      limits: { projects: 10, keys: 15000, members: 25, locales: null },
      usage: { projects: 2, members: 4, keys: 120, locales: 2 },
    })
    expect(licensesCalls).toEqual(['https://licenses.test/v1/entitlements/verba/acc-a'])
  })

  it('refuses a member below account admin, and someone outside the account', async () => {
    cookies = { token: await signToken({ userId: 'u-member', email: 'm@example.com' }) }
    expect((await inject(app, { method: 'GET', url: '/accounts/acc-a/billing', cookies })).statusCode).toBe(403)
    cookies = { token: await signToken({ userId: 'u-other', email: 'o@example.com' }) }
    expect((await inject(app, { method: 'GET', url: '/accounts/acc-a/billing', cookies })).statusCode).toBe(404)
    expect(licensesCalls).toHaveLength(0)
  })

  it('accepts a signed entitlement and refuses an unsigned one', async () => {
    const bad = await inject(app, {
      method: 'POST',
      url: '/billing/entitlement',
      payload: JSON.stringify({ event: 'entitlement.updated', timestamp: 'now', data: PRO }),
      headers: { 'content-type': 'application/json', 'x-nubisco-signature': `sha256=${'0'.repeat(64)}` },
    })
    expect(bad.statusCode).toBe(401)
    expect(prisma.accountPlan.create).not.toHaveBeenCalled()
    const ok = await inject(app, {
      method: 'POST',
      url: '/billing/entitlement',
      ...signed({ event: 'entitlement.updated', timestamp: '2026-11-03T00:00:00Z', data: PRO }),
    })
    expect(ok.statusCode).toBe(200)
    expect(ok.json().outcome).toBe('applied')
    expect(prisma.accountPlan.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ accountId: 'acc-a', plan: 'pro', version: 3 }),
    })
  })

  it('leaves JSON parsing of every other route as it was', async () => {
    cookies = { token: await signToken({ userId: 'u-admin', email: 'a@example.com' }) }
    // The webhook reads its body as raw text. The checkout, outside its scope,
    // still gets parsed JSON: the period is read and licenses is asked. This
    // fake licenses names no checkout page, so the answer is 503, not a 400.
    const res = await inject(app, {
      method: 'POST',
      url: '/accounts/acc-a/billing/checkout',
      cookies,
      payload: { billing: 'monthly' },
    })
    expect(res.statusCode).toBe(503)
    expect(licensesCalls).toEqual(['https://licenses.test/v1/billing/checkout'])
  })
})
