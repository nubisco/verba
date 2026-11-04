// Copyright (c) Nubisco: All Rights Reserved.
// See packages/ee/LICENSE for terms. Enterprise Edition only.

/**
 * Hosted plans and billing over HTTP.
 *
 * - POST /billing/entitlement: the signed entitlement.updated webhook from
 *   licenses. Authenticated by its HMAC, not by a session.
 * - GET /accounts/:accountId/billing, POST .../billing/checkout and
 *   .../billing/portal: account owners and admins only. Checkout also needs
 *   VERBA_CHECKOUT_OPEN="true", and is refused with 403 `checkout_closed`
 *   without it. The page reads the
 *   plan and usage, and the actions go through licenses, never to Paddle.
 *   Checkout itself runs on nubisco.io, the only domain Paddle allows it on:
 *   .../billing/checkout answers with that page's address and the browser
 *   goes there. Verba never loads Paddle.js.
 *
 * The API mounts this plugin only when EE is enabled and the licenses service
 * is configured (apps/api/src/services/billing.service.ts).
 */

import type { Context, Hono, MiddlewareHandler } from 'hono'
import { z } from 'zod'
import { configFromEnv, configurePlans, plansConfig, type PlansConfig } from './config.js'
import { LicensesError, openPortal, startCheckout, type LicensesEntitlement } from './client.js'
import { PLANS } from '../entitlements/plans.js'
import { hostedLimits } from './limits.js'
import { signatureMatches } from './signature.js'
import { applyEntitlement, planFor, type ApplyOutcome, type PlansDb } from './store.js'

/** What the routes read from a request: who is signed in, set by `authenticate`. */
export interface PlansEnv {
  Variables: { user: { userId: string } }
}

/** What the API hands the plugin: its database and its own account checks. */
export interface PlansDeps {
  db: PlansDb
  /** Middleware that sets `user` from the session (the API's `authenticate`). */
  authenticate: MiddlewareHandler<PlansEnv>
  /** Throws 404 for a non-member and 403 below account ADMIN. */
  requireAccountAdmin: (userId: string, accountId: string) => Promise<unknown>
  /** What the account holds now, in the licenses limit keys. */
  accountUsage: (accountId: string) => Promise<Record<string, number>>
  /** Defaults to process.env. */
  env?: Record<string, string | undefined>
  /** Defaults to the global fetch. Tests pass a fake licenses. */
  fetchImpl?: typeof fetch
}

const zEntitlementDelivery = z.object({
  event: z.literal('entitlement.updated'),
  timestamp: z.string(),
  data: z
    .object({
      app: z.string(),
      workspace_id: z.string().min(1),
      plan: z.string(),
      state: z.enum(['trialing', 'active', 'grace', 'restricted', 'free']),
      source: z.enum(['subscription', 'override', 'free']),
      limits: z.record(z.string(), z.number().nullable()),
      version: z.number().int(),
    })
    .passthrough(),
})

const zCheckout = z.object({ billing: z.enum(['monthly', 'yearly']) })

function httpError(statusCode: number, message: string, details?: Record<string, unknown>): Error {
  return Object.assign(new Error(message), { statusCode, ...(details ? { details } : {}) })
}

function configured(): PlansConfig {
  const cfg = plansConfig()
  if (!cfg) throw httpError(404, 'Billing is not set up on this instance')
  return cfg
}

/** licenses' refusals, in words an account admin can act on. */
function fromLicenses(err: unknown): never {
  if (err instanceof LicensesError) {
    if (err.code === 'conflict')
      throw httpError(409, 'This account already has a subscription. Use Manage billing to change it.', {
        code: 'conflict',
      })
    if (err.status === 400) throw httpError(400, err.message)
  }
  console.error('plans: licenses call failed', err)
  throw httpError(502, 'Billing could not be reached just now. Try again in a minute.')
}

/** The checkout page licenses answered with, when it is an https URL. */
export function checkoutPage(raw: string | null | undefined): string | null {
  if (!raw) return null
  try {
    const url = new URL(raw)
    return url.protocol === 'https:' ? url.toString() : null
  } catch {
    return null
  }
}

/** A JSON body, or {} when there is none or it is not JSON (the schema then refuses it). */
async function jsonBody(c: Context<PlansEnv>): Promise<unknown> {
  try {
    return (await c.req.json()) ?? {}
  } catch {
    return {}
  }
}

/** The signed webhook. Its body is read as the exact bytes that were signed. */
function entitlementWebhook(app: Hono<PlansEnv>, deps: PlansDeps): void {
  app.post('/billing/entitlement', async (c) => {
    const secret = plansConfig()?.webhookSecret
    if (!secret) return c.json({ error: 'Not found' }, 404)
    // There is no timestamp window: licenses retries a delivery for a day with
    // its first timestamp, and replaying an old one cannot do harm because a
    // version lower than or equal to the one held changes nothing.
    const raw = await c.req.text()
    if (!signatureMatches(secret, raw, c.req.header('x-nubisco-signature')))
      return c.json({ error: 'Bad signature' }, 401)
    let delivery: z.infer<typeof zEntitlementDelivery>
    try {
      delivery = zEntitlementDelivery.parse(JSON.parse(raw))
    } catch {
      return c.json({ error: 'Malformed delivery' }, 400)
    }
    if (delivery.data.app !== 'verba') return c.json({ error: 'Not a Verba entitlement' }, 400)
    const outcome: ApplyOutcome = (
      await applyEntitlement(deps.db, delivery.data as unknown as LicensesEntitlement, new Date())
    ).outcome
    // 2xx either way: an account deleted here must not be retried for a day.
    return c.json({ ok: true, outcome })
  })
}

/**
 * The billing routes. Registers nothing (and leaves plans off) unless the
 * licenses service is configured.
 */
export function plansPlugin(app: Hono<PlansEnv>, deps: PlansDeps): void {
  const cfg = configFromEnv(deps.env ?? process.env, deps.fetchImpl ?? fetch)
  configurePlans(cfg)
  if (!cfg) return

  entitlementWebhook(app, deps)

  const admin = async (c: Context<PlansEnv>) => {
    const accountId = c.req.param('accountId') as string
    await deps.requireAccountAdmin(c.get('user').userId, accountId)
    return accountId
  }

  /** The page: plan, state, limits and usage against them. */
  app.get('/accounts/:accountId/billing', deps.authenticate, async (c) => {
    const accountId = await admin(c)
    const config = configured()
    // Fetched on open, so someone back from checkout sees the new plan even
    // when the webhook is late.
    const row = await planFor(deps.db, accountId, { force: true })
    c.header('cache-control', 'no-store')
    return c.json({
      // As licenses names it: free, pro, or enterprise for a sales deal.
      plan: row?.plan ?? 'free',
      state: row?.state ?? 'free',
      source: row?.source ?? 'free',
      subscription: row?.subscription ?? null,
      limits: hostedLimits(row),
      usage: await deps.accountUsage(accountId),
      salesUrl: config.salesUrl,
      // Whether the page offers the upgrade (VERBA_CHECKOUT_OPEN).
      checkoutOpen: config.checkoutOpen,
      // What Pro raises the limits to, for the upgrade panel. Verba's plan
      // table matches the Paddle product (account totals).
      proLimits: {
        projects: PLANS.pro.baseEntitlements.maxProjects,
        members: PLANS.pro.baseEntitlements.maxMembers,
        keys: PLANS.pro.baseEntitlements.maxKeys,
        locales: PLANS.pro.baseEntitlements.maxLocales,
      },
    })
  })

  app.post('/accounts/:accountId/billing/checkout', deps.authenticate, async (c) => {
    const accountId = await admin(c)
    const config = configured()
    // Checkout stays shut until it is switched on (VERBA_CHECKOUT_OPEN). The
    // plan, its limits and Manage billing keep working without it.
    if (!config.checkoutOpen)
      throw httpError(403, 'Upgrading is not open yet. Contact sales to change the plan.', {
        code: 'checkout_closed',
        salesUrl: config.salesUrl,
      })
    const parsed = zCheckout.safeParse(await jsonBody(c))
    if (!parsed.success) throw httpError(400, 'billing must be monthly or yearly')
    let res: Awaited<ReturnType<typeof startCheckout>>
    try {
      res = await startCheckout(config, { workspace_id: accountId, billing: parsed.data.billing })
    } catch (err) {
      fromLicenses(err)
    }
    // licenses sets the transaction's checkout to Verba's page on nubisco.io
    // and answers with it, carrying ?_ptxn=. Paddle refuses checkout on any
    // other domain, so without that page there is nowhere to send the buyer.
    const url = checkoutPage(res.checkout_url)
    if (!url) throw httpError(503, 'Checkout is not set up on this instance.')
    return c.json({ transactionId: res.transaction_id, checkoutUrl: url })
  })

  app.post('/accounts/:accountId/billing/portal', deps.authenticate, async (c) => {
    const accountId = await admin(c)
    const config = configured()
    try {
      const res = await openPortal(config, accountId)
      return c.json({ url: res.url })
    } catch (err) {
      if (err instanceof LicensesError && err.status === 404)
        throw httpError(404, 'This account has no subscription to manage yet.')
      fromLicenses(err)
    }
  })
}
