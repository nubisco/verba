// Copyright (c) Nubisco: All Rights Reserved.
// See packages/ee/LICENSE for terms. Enterprise Edition only.

/**
 * Hosted plans and billing over HTTP.
 *
 * - POST /billing/entitlement: the signed entitlement.updated webhook from
 *   licenses. Authenticated by its HMAC, not by a session.
 * - GET /accounts/:accountId/billing, POST .../billing/checkout and
 *   .../billing/portal: account owners and admins only. The page reads the
 *   plan and usage, and the actions go through licenses, never to Paddle.
 *   Checkout itself runs on nubisco.io, the only domain Paddle allows it on:
 *   .../billing/checkout answers with that page's address and the browser
 *   goes there. Verba never loads Paddle.js.
 *
 * The API mounts this plugin only when EE is enabled and the licenses service
 * is configured (apps/api/src/services/billing.service.ts).
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { configFromEnv, configurePlans, plansConfig, type PlansConfig } from './config.js'
import { LicensesError, openPortal, startCheckout, type LicensesEntitlement } from './client.js'
import { hostedLimits, hostedPlanId } from './limits.js'
import { signatureMatches } from './signature.js'
import { applyEntitlement, planFor, type ApplyOutcome, type PlansDb } from './store.js'

/** What the API hands the plugin: its database and its own account checks. */
export interface PlansDeps {
  db: PlansDb
  /** Fastify preHandler that sets req.user from the session (app.authenticate). */
  authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>
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

/** The signed webhook, in its own scope so its body stays the exact bytes signed. */
async function entitlementWebhook(app: FastifyInstance, deps: PlansDeps): Promise<void> {
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => done(null, body))

  app.post('/billing/entitlement', async (req, reply) => {
    const secret = plansConfig()?.webhookSecret
    if (!secret) return reply.status(404).send({ error: 'Not found' })
    // There is no timestamp window: licenses retries a delivery for a day with
    // its first timestamp, and replaying an old one cannot do harm because a
    // version lower than or equal to the one held changes nothing.
    const raw = typeof req.body === 'string' ? req.body : ''
    const header = req.headers['x-nubisco-signature']
    if (!signatureMatches(secret, raw, typeof header === 'string' ? header : undefined))
      return reply.status(401).send({ error: 'Bad signature' })
    let delivery: z.infer<typeof zEntitlementDelivery>
    try {
      delivery = zEntitlementDelivery.parse(JSON.parse(raw))
    } catch {
      return reply.status(400).send({ error: 'Malformed delivery' })
    }
    if (delivery.data.app !== 'verba') return reply.status(400).send({ error: 'Not a Verba entitlement' })
    const outcome: ApplyOutcome = (
      await applyEntitlement(deps.db, delivery.data as unknown as LicensesEntitlement, new Date())
    ).outcome
    // 2xx either way: an account deleted here must not be retried for a day.
    return reply.send({ ok: true, outcome })
  })
}

/**
 * The billing routes. Registers nothing (and leaves plans off) unless the
 * licenses service is configured.
 */
export async function plansPlugin(app: FastifyInstance, deps: PlansDeps): Promise<void> {
  const cfg = configFromEnv(deps.env ?? process.env, deps.fetchImpl ?? fetch)
  configurePlans(cfg)
  if (!cfg) return

  await app.register(entitlementWebhook, deps)

  const admin = async (req: FastifyRequest<{ Params: { accountId: string } }>) => {
    const user = (req as unknown as { user: { userId: string } }).user
    await deps.requireAccountAdmin(user.userId, req.params.accountId)
    return req.params.accountId
  }

  /** The page: plan, state, limits and usage against them. */
  app.get<{ Params: { accountId: string } }>(
    '/accounts/:accountId/billing',
    { preHandler: [deps.authenticate] },
    async (req, reply) => {
      const accountId = await admin(req)
      const config = configured()
      // Fetched on open, so someone back from checkout sees the new plan even
      // when the webhook is late.
      const row = await planFor(deps.db, accountId, { force: true })
      reply.header('cache-control', 'no-store')
      return {
        plan: hostedPlanId(row),
        state: row?.state ?? 'free',
        source: row?.source ?? 'free',
        subscription: row?.subscription ?? null,
        limits: hostedLimits(row),
        usage: await deps.accountUsage(accountId),
        salesUrl: config.salesUrl,
      }
    },
  )

  app.post<{ Params: { accountId: string } }>(
    '/accounts/:accountId/billing/checkout',
    { preHandler: [deps.authenticate] },
    async (req) => {
      const accountId = await admin(req)
      const config = configured()
      const parsed = zCheckout.safeParse(req.body ?? {})
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
      return { transactionId: res.transaction_id, checkoutUrl: url }
    },
  )

  app.post<{ Params: { accountId: string } }>(
    '/accounts/:accountId/billing/portal',
    { preHandler: [deps.authenticate] },
    async (req) => {
      const accountId = await admin(req)
      const config = configured()
      try {
        const res = await openPortal(config, accountId)
        return { url: res.url }
      } catch (err) {
        if (err instanceof LicensesError && err.status === 404)
          throw httpError(404, 'This account has no subscription to manage yet.')
        fromLicenses(err)
      }
    },
  )
}
