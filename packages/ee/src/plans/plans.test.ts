// Copyright (c) Nubisco: All Rights Reserved.
// See packages/ee/LICENSE for terms. Enterprise Edition only.

/**
 * Hosted plans from the licenses service: config gating, the cached
 * entitlement (never dropped on a network error), the signed webhook, and the
 * checkout that only ever redirects to the page licenses names. Licenses and
 * Paddle are never called: a fake licenses answers every fetch.
 */

import Fastify, { type FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveEntitlements, type EntitlementsDb } from '../entitlements/entitlement.service.js'
import type { LicensesEntitlement } from './client.js'
import { configFromEnv, configurePlans, plansConfig } from './config.js'
import { PLANS } from '../entitlements/plans.js'
import { accountLimits } from './enforce.js'
import { FREE_LIMITS } from './limits.js'
import { plansPlugin, type PlansDeps } from './routes.js'
import { hmacSha256Hex } from './signature.js'
import { STALE_MS, applyEntitlement, cachedPlan, planFor, type AccountPlanDbRow } from './store.js'

const LICENSES = 'https://licenses.test'
const HOOK_SECRET = 'test-entitlement-secret'
const ENV = {
  VERBA_LICENSES_URL: LICENSES,
  VERBA_LICENSES_SERVICE_TOKEN: 'svc-token',
  VERBA_ENTITLEMENT_WEBHOOK_SECRET: HOOK_SECRET,
}
const ACCOUNT = 'acc_1'

// ── An in-memory AccountPlan table ──────────────────────────────────────────

function memoryDb() {
  const accounts = new Set<string>([ACCOUNT])
  const plans = new Map<string, AccountPlanDbRow>()
  const db: EntitlementsDb = {
    account: { findUnique: async ({ where }) => (accounts.has(where.id) ? { id: where.id } : null) },
    accountPlan: {
      findUnique: async ({ where }) => {
        const row = plans.get(where.accountId)
        return row ? { ...row } : null
      },
      create: async ({ data }) => {
        if (plans.has(data.accountId)) throw new Error('unique constraint')
        plans.set(data.accountId, { ...data })
        return data
      },
      updateMany: async ({ where, data }) => {
        const row = plans.get(where.accountId)
        if (!row || (where.version && !(row.version < where.version.lt))) return { count: 0 }
        plans.set(where.accountId, { ...row, ...data })
        return { count: 1 }
      },
    },
    entitlementOverride: { findUnique: async () => null },
    licenseState: { findFirst: async () => null },
  }
  return { db, plans, accounts }
}

// ── A fake licenses ─────────────────────────────────────────────────────────

let entitlements: Map<string, LicensesEntitlement>
let calls: { method: string; path: string; body: Record<string, unknown> | undefined; auth: string | null }[]
let licensesDown: boolean
let checkoutUrl: string | null
let checkoutAnswer: (() => Response) | null

function entitlement(over: Partial<LicensesEntitlement> = {}): LicensesEntitlement {
  return {
    app: 'verba',
    workspace_id: ACCOUNT,
    plan: 'free',
    state: 'free',
    source: 'free',
    limits: { projects: 3, keys: 1500, members: 5, locales: 5 },
    subscription: null,
    override: null,
    version: 0,
    computed_at: new Date().toISOString(),
    ...over,
  }
}

function pro(over: Partial<LicensesEntitlement> = {}, status = 'active'): LicensesEntitlement {
  return entitlement({
    plan: 'pro',
    state: status === 'trialing' ? 'trialing' : 'active',
    source: 'subscription',
    limits: { projects: 10, keys: 15000, members: 25, locales: null },
    subscription: {
      id: 'sub_1',
      status,
      plan: 'pro',
      billing: 'monthly',
      extra_members: 0,
      current_period_end: '2026-12-01T00:00:00Z',
      ends_at: null,
      grace_until: null,
    },
    version: 5,
    ...over,
  })
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

const fakeLicenses = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
  const url = new URL(String(input))
  const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined
  const headers = new Headers(init?.headers)
  calls.push({ method: init?.method ?? 'GET', path: url.pathname, body, auth: headers.get('authorization') })
  if (licensesDown) throw new TypeError('network down')
  if (url.pathname.startsWith('/v1/entitlements/verba/')) {
    const id = decodeURIComponent(url.pathname.split('/').pop()!)
    return json(entitlements.get(id) ?? { ...entitlement(), workspace_id: id })
  }
  if (url.pathname === '/v1/billing/checkout') {
    if (checkoutAnswer) return checkoutAnswer()
    return json({ transaction_id: 'txn_1', checkout_url: checkoutUrl })
  }
  if (url.pathname === '/v1/billing/portal') return json({ url: 'https://portal.test/overview' })
  return json({ error: 'not_found' }, 404)
}) as typeof fetch

// ── The app under test ──────────────────────────────────────────────────────

let mem: ReturnType<typeof memoryDb>
let app: FastifyInstance

async function buildApp(env: Record<string, string | undefined> = ENV): Promise<FastifyInstance> {
  const a = Fastify()
  // The API's own error handler, so thrown { statusCode, details } read the same.
  a.setErrorHandler((err, _req, reply) => {
    const e = err as { statusCode?: number; message?: string; details?: Record<string, unknown> }
    void reply.status(e.statusCode ?? 500).send({ error: e.message, ...(e.details ?? {}) })
  })
  const deps: PlansDeps = {
    db: mem.db,
    // A session is the x-test-user header here: who is signed in.
    authenticate: async (req, reply) => {
      const user = req.headers['x-test-user']
      if (typeof user !== 'string') {
        await reply.status(401).send({ error: 'Unauthorized' })
        return
      }
      ;(req as unknown as { user: { userId: string } }).user = { userId: user }
    },
    requireAccountAdmin: async (userId) => {
      if (userId !== 'admin') throw Object.assign(new Error('Forbidden'), { statusCode: 403 })
    },
    accountUsage: async () => ({ projects: 1, members: 2, keys: 340, locales: 4 }),
    env,
    fetchImpl: fakeLicenses,
  }
  await a.register(plansPlugin, deps)
  await a.ready()
  return a
}

function signedDelivery(e: LicensesEntitlement, secret = HOOK_SECRET) {
  const payload = JSON.stringify({ event: 'entitlement.updated', timestamp: new Date().toISOString(), data: e })
  return {
    payload,
    headers: { 'content-type': 'application/json', 'x-nubisco-signature': `sha256=${hmacSha256Hex(secret, payload)}` },
  }
}

function push(e: LicensesEntitlement, secret = HOOK_SECRET) {
  const { payload, headers } = signedDelivery(e, secret)
  return app.inject({ method: 'POST', url: '/billing/entitlement', payload, headers })
}

beforeEach(async () => {
  mem = memoryDb()
  entitlements = new Map()
  calls = []
  licensesDown = false
  checkoutUrl = 'https://nubisco.io/products/verba?_ptxn=txn_1'
  checkoutAnswer = null
  vi.spyOn(console, 'error').mockImplementation(() => {})
  app = await buildApp()
})

afterEach(async () => {
  await app.close()
  configurePlans(null)
  vi.restoreAllMocks()
})

// ── Config gating ───────────────────────────────────────────────────────────

describe('config gating', () => {
  it('is off unless both the licenses URL and the service token are set', () => {
    expect(configFromEnv({})).toBeNull()
    expect(configFromEnv({ VERBA_LICENSES_URL: LICENSES })).toBeNull()
    expect(configFromEnv({ VERBA_LICENSES_SERVICE_TOKEN: 'svc-token' })).toBeNull()
    expect(configFromEnv({ VERBA_LICENSES_URL: ' ', VERBA_LICENSES_SERVICE_TOKEN: 'svc-token' })).toBeNull()
    const cfg = configFromEnv({ ...ENV, VERBA_LICENSES_URL: `${LICENSES}//` })
    expect(cfg?.licensesUrl).toBe(LICENSES)
    expect(cfg?.webhookSecret).toBe(HOOK_SECRET)
  })

  it('mounts no routes and leaves plans off without the licenses service', async () => {
    await app.close()
    app = await buildApp({})
    expect(plansConfig()).toBeNull()
    const page = await app.inject({
      method: 'GET',
      url: `/accounts/${ACCOUNT}/billing`,
      headers: { 'x-test-user': 'admin' },
    })
    expect(page.statusCode).toBe(404)
    const hook = await push(pro())
    expect(hook.statusCode).toBe(404)
    // Resolution is what it always was: no limits, no billing, licenses never asked.
    const ctx = await resolveEntitlements(mem.db, ACCOUNT)
    expect(ctx.plan.id).toBe('oss_self_hosted')
    expect(ctx.entitlements.maxProjects).toBeNull()
    expect(ctx.billing).toBeNull()
    expect(calls).toHaveLength(0)
  })

  it('never hands the config object to fetch as `this`', async () => {
    // Like a runtime's own fetch: it refuses to run with any other `this`.
    let calledBare = false
    const strictFetch = function (this: unknown) {
      if (this !== undefined) throw new TypeError('Illegal invocation')
      calledBare = true
      return Promise.resolve(json(entitlement()))
    } as unknown as typeof fetch
    const cfg = configFromEnv(ENV, strictFetch)!
    await cfg.fetchImpl(`${LICENSES}/v1/entitlements/verba/x`)
    expect(calledBare).toBe(true)
  })
})

// ── The plan an account is held to ──────────────────────────────────────────

describe('the plan an account is held to', () => {
  it('holds Free to the same numbers as the plan table when licenses cannot be asked', async () => {
    expect(FREE_LIMITS).toEqual({
      projects: PLANS.free.baseEntitlements.maxProjects,
      members: PLANS.free.baseEntitlements.maxMembers,
      keys: PLANS.free.baseEntitlements.maxKeys,
      locales: PLANS.free.baseEntitlements.maxLocales,
    })
    expect(FREE_LIMITS).toEqual({ projects: 3, members: 5, keys: 1500, locales: 5 })
  })

  it('is Free with no row and licenses unreachable', async () => {
    licensesDown = true
    const ctx = await resolveEntitlements(mem.db, ACCOUNT)
    expect(ctx.plan.id).toBe('free')
    expect(ctx.entitlements.maxProjects).toBe(FREE_LIMITS.projects)
    expect(ctx.entitlements.maxMembers).toBe(FREE_LIMITS.members)
    expect(ctx.billing).toEqual({ state: 'free', source: 'free', version: null, fetchedAt: null })
  })

  it('never drops to Free on a network error', async () => {
    const old = new Date(Date.now() - 2 * STALE_MS)
    await applyEntitlement(mem.db, pro(), old)
    licensesDown = true
    const row = await planFor(mem.db, ACCOUNT, { force: true })
    expect(row?.plan).toBe('pro')
    const ctx = await resolveEntitlements(mem.db, ACCOUNT)
    expect(ctx.plan.id).toBe('pro')
    expect(ctx.entitlements.maxProjects).toBe(10)
    // Asked licenses (the row was stale) and kept what it held.
    expect(calls.some((c) => c.path === `/v1/entitlements/verba/${ACCOUNT}`)).toBe(true)
  })

  it('fetches a missing entitlement once, with the service token, and caches it', async () => {
    entitlements.set(ACCOUNT, pro())
    await resolveEntitlements(mem.db, ACCOUNT)
    await resolveEntitlements(mem.db, ACCOUNT)
    const fetches = calls.filter((c) => c.path.startsWith('/v1/entitlements/'))
    expect(fetches).toHaveLength(1)
    expect(fetches[0].auth).toBe('Bearer svc-token')
  })

  it('takes the limits from the entitlement, not from a table in Verba', async () => {
    entitlements.set(ACCOUNT, pro({ limits: { projects: 10, keys: 15000, members: 25, locales: null } }))
    const ctx = await resolveEntitlements(mem.db, ACCOUNT)
    expect(ctx.plan.id).toBe('pro')
    expect(ctx.entitlements.maxProjects).toBe(10)
    expect(ctx.entitlements.maxMembers).toBe(25)
    expect(ctx.entitlements.maxKeys).toBe(15000)
    expect(ctx.entitlements.maxLocales).toBeNull()
    // The per-project caps of the old plan table do not apply to a hosted account.
    expect(ctx.entitlements.maxKeysPerProject).toBeNull()
    expect(ctx.subscription?.status).toBe('active')
    expect(ctx.billing?.source).toBe('subscription')
  })

  it('holds a sales deal to its own limits, with the features of Pro', async () => {
    entitlements.set(
      ACCOUNT,
      entitlement({
        plan: 'enterprise',
        state: 'active',
        source: 'override',
        limits: { projects: null, keys: null, members: 120, locales: null },
        version: 2,
      }),
    )
    const ctx = await resolveEntitlements(mem.db, ACCOUNT)
    expect(ctx.plan.id).toBe('pro')
    expect(ctx.entitlements.maxMembers).toBe(120)
    expect(ctx.entitlements.maxProjects).toBeNull()
  })

  it('a licence key on a self-hosted instance still decides the plan', async () => {
    const db: EntitlementsDb = {
      ...mem.db,
      licenseState: {
        findFirst: async () => ({
          status: 'valid',
          licensee: 'Example Ltd',
          planId: 'self_hosted_enterprise',
          seats: 50,
          features: '[]',
          expiresAt: null,
          graceEndsAt: null,
          lastVerifiedAt: null,
        }),
      },
    }
    const ctx = await resolveEntitlements(db, ACCOUNT)
    expect(ctx.plan.id).toBe('self_hosted_enterprise')
    expect(calls).toHaveLength(0)
  })
})

// ── The entitlement webhook ─────────────────────────────────────────────────

describe('the entitlement webhook', () => {
  it('refuses a bad signature and writes nothing', async () => {
    const res = await push(pro(), 'not-the-secret')
    expect(res.statusCode).toBe(401)
    expect(mem.plans.size).toBe(0)
  })

  it('refuses a missing or malformed signature header', async () => {
    const { payload } = signedDelivery(pro())
    for (const sig of [undefined, 'sha256=zz', 'md5=abc']) {
      const res = await app.inject({
        method: 'POST',
        url: '/billing/entitlement',
        payload,
        headers: { 'content-type': 'application/json', ...(sig ? { 'x-nubisco-signature': sig } : {}) },
      })
      expect(res.statusCode).toBe(401)
    }
    expect(mem.plans.size).toBe(0)
  })

  it('accepts a signed delivery and applies it', async () => {
    const res = await push(pro())
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ ok: true, outcome: 'applied' })
    expect((await cachedPlan(mem.db, ACCOUNT))?.plan).toBe('pro')
  })

  it('a replayed or older delivery changes nothing', async () => {
    const v5 = signedDelivery(pro({ version: 5 }))
    await app.inject({ method: 'POST', url: '/billing/entitlement', ...v5 })
    // The very same bytes, sent again.
    const replay = await app.inject({ method: 'POST', url: '/billing/entitlement', ...v5 })
    expect(replay.statusCode).toBe(200)
    expect(replay.json().outcome).toBe('stale')
    // An older version, signed properly, arriving late.
    const older = await push(entitlement({ version: 4 }))
    expect(older.json().outcome).toBe('stale')
    const held = await cachedPlan(mem.db, ACCOUNT)
    expect(held?.plan).toBe('pro')
    expect(held?.version).toBe(5)
    // A newer one wins.
    const newer = await push(entitlement({ version: 6 }))
    expect(newer.json().outcome).toBe('applied')
    expect((await cachedPlan(mem.db, ACCOUNT))?.plan).toBe('free')
  })

  it('answers 2xx for an account that is not here, so licenses stops retrying', async () => {
    const res = await push(pro({ workspace_id: 'acc_gone' }))
    expect(res.statusCode).toBe(200)
    expect(res.json().outcome).toBe('unknown_account')
  })

  it('refuses another product’s entitlement', async () => {
    const res = await push(pro({ app: 'acta' }))
    expect(res.statusCode).toBe(400)
    expect(mem.plans.size).toBe(0)
  })

  it('is not there when no secret is configured', async () => {
    await app.close()
    app = await buildApp({ ...ENV, VERBA_ENTITLEMENT_WEBHOOK_SECRET: undefined })
    const res = await push(pro())
    expect(res.statusCode).toBe(404)
  })
})

// ── The billing routes ──────────────────────────────────────────────────────

describe('the billing routes', () => {
  const as = (user: string) => ({ 'x-test-user': user })

  it('reports plan, limits and usage, fetched from licenses on open', async () => {
    entitlements.set(ACCOUNT, pro())
    const res = await app.inject({ method: 'GET', url: `/accounts/${ACCOUNT}/billing`, headers: as('admin') })
    expect(res.statusCode).toBe(200)
    expect(res.headers['cache-control']).toBe('no-store')
    const body = res.json()
    expect(body.plan).toBe('pro')
    expect(body.limits).toEqual({ projects: 10, keys: 15000, members: 25, locales: null })
    expect(body.usage).toEqual({ projects: 1, members: 2, keys: 340, locales: 4 })
    expect(body.proLimits).toEqual({ projects: 10, members: 25, keys: 15000, locales: null })
    // Fetched even though nothing was cached as stale: the page always asks.
    await app.inject({ method: 'GET', url: `/accounts/${ACCOUNT}/billing`, headers: as('admin') })
    expect(calls.filter((c) => c.path.startsWith('/v1/entitlements/'))).toHaveLength(2)
  })

  it('is for account admins only', async () => {
    for (const url of [`/accounts/${ACCOUNT}/billing`]) {
      expect((await app.inject({ method: 'GET', url })).statusCode).toBe(401)
      expect((await app.inject({ method: 'GET', url, headers: as('member') })).statusCode).toBe(403)
    }
    for (const url of [`/accounts/${ACCOUNT}/billing/checkout`, `/accounts/${ACCOUNT}/billing/portal`]) {
      const res = await app.inject({ method: 'POST', url, headers: as('member'), payload: { billing: 'monthly' } })
      expect(res.statusCode).toBe(403)
    }
    expect(calls.filter((c) => c.path.startsWith('/v1/billing/'))).toHaveLength(0)
  })

  it('starts a checkout through licenses and answers with the nubisco.io page', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/accounts/${ACCOUNT}/billing/checkout`,
      headers: as('admin'),
      payload: { billing: 'yearly' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({
      transactionId: 'txn_1',
      checkoutUrl: 'https://nubisco.io/products/verba?_ptxn=txn_1',
    })
    const call = calls.find((c) => c.path === '/v1/billing/checkout')!
    expect(call.auth).toBe('Bearer svc-token')
    expect(call.body).toEqual({ app: 'verba', plan: 'pro', extra_members: 0, workspace_id: ACCOUNT, billing: 'yearly' })
  })

  it('refuses a checkout licenses gave no usable page for', async () => {
    for (const url of [null, 'http://nubisco.io/products/verba?_ptxn=txn_1', 'not a url']) {
      checkoutUrl = url
      const res = await app.inject({
        method: 'POST',
        url: `/accounts/${ACCOUNT}/billing/checkout`,
        headers: as('admin'),
        payload: { billing: 'monthly' },
      })
      expect(res.statusCode).toBe(503)
    }
  })

  it('refuses a bad period, and explains an existing subscription', async () => {
    const bad = await app.inject({
      method: 'POST',
      url: `/accounts/${ACCOUNT}/billing/checkout`,
      headers: as('admin'),
      payload: { billing: 'weekly' },
    })
    expect(bad.statusCode).toBe(400)
    checkoutAnswer = () => json({ error: 'conflict', message: 'already subscribed' }, 409)
    const conflict = await app.inject({
      method: 'POST',
      url: `/accounts/${ACCOUNT}/billing/checkout`,
      headers: as('admin'),
      payload: { billing: 'monthly' },
    })
    expect(conflict.statusCode).toBe(409)
    expect(conflict.json().error).toMatch(/Manage billing/)
  })

  it('says billing is unreachable rather than passing on a network error', async () => {
    licensesDown = true
    const res = await app.inject({
      method: 'POST',
      url: `/accounts/${ACCOUNT}/billing/checkout`,
      headers: as('admin'),
      payload: { billing: 'monthly' },
    })
    expect(res.statusCode).toBe(502)
  })

  it('opens the customer portal through licenses', async () => {
    const res = await app.inject({ method: 'POST', url: `/accounts/${ACCOUNT}/billing/portal`, headers: as('admin') })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ url: 'https://portal.test/overview' })
    expect(calls.find((c) => c.path === '/v1/billing/portal')?.body).toEqual({ app: 'verba', workspace_id: ACCOUNT })
  })
})

// ── What the API enforces ───────────────────────────────────────────────────

describe('accountLimits', () => {
  it('reports the hosted limits the API enforces on creation', async () => {
    entitlements.set(ACCOUNT, pro())
    expect(await accountLimits(mem.db, ACCOUNT)).toEqual({ projects: 10, members: 25, keys: 15000 })
  })

  it('reports nothing to enforce when plans are off', async () => {
    configurePlans(null)
    expect(await accountLimits(mem.db, ACCOUNT)).toBeNull()
    expect(calls).toHaveLength(0)
  })

  it('reports nothing to enforce when a licence key decides the plan', async () => {
    const db: EntitlementsDb = {
      ...mem.db,
      licenseState: {
        findFirst: async () => ({
          status: 'valid',
          licensee: 'Example Ltd',
          planId: 'self_hosted_enterprise',
          seats: 50,
          features: '[]',
          expiresAt: null,
          graceEndsAt: null,
          lastVerifiedAt: null,
        }),
      },
    }
    expect(await accountLimits(db, ACCOUNT)).toBeNull()
  })
})
