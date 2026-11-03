// Copyright (c) Nubisco: All Rights Reserved.
// See packages/ee/LICENSE for terms. Enterprise Edition only.

/**
 * Calls to Nubisco's licenses service (licenses/docs/billing.md). Verba never
 * calls Paddle and never holds a Paddle key: licenses starts the checkout and
 * opens the customer portal, and pushes the result back as an entitlement.
 *
 * The workspace licenses knows is Verba's account: `workspace_id` is always an
 * Account id.
 */

import type { PlansConfig } from './config.js'

export const APP = 'verba'
/** The one self-serve paid plan. Free is not a Paddle product. */
export const PAID_PLAN = 'pro'

export type EntitlementState = 'trialing' | 'active' | 'grace' | 'restricted' | 'free'
export type EntitlementSource = 'subscription' | 'override' | 'free'

export interface LicensesSubscription {
  id: string
  status: string
  plan: string
  billing: 'monthly' | 'yearly' | null
  extra_members: number
  current_period_end: string | null
  ends_at: string | null
  grace_until: string | null
}

/** The entitlement exactly as licenses sends it. */
export interface LicensesEntitlement {
  app: string
  workspace_id: string
  plan: string
  state: EntitlementState
  source: EntitlementSource
  /** Verba keys: projects, keys, members, locales. Null is unlimited. */
  limits: Record<string, number | null>
  subscription: LicensesSubscription | null
  override: unknown
  version: number
  computed_at: string
}

/** A refusal from licenses, with its error code. */
export class LicensesError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message)
  }
}

const TIMEOUT_MS = 5_000

async function call<T>(cfg: PlansConfig, method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const res = await cfg.fetchImpl(`${cfg.licensesUrl}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${cfg.serviceToken}`,
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok)
    throw new LicensesError(
      res.status,
      typeof json.error === 'string' ? json.error : 'error',
      typeof json.message === 'string' ? json.message : `HTTP ${res.status}`,
    )
  return json as T
}

export function fetchEntitlement(cfg: PlansConfig, accountId: string): Promise<LicensesEntitlement> {
  return call(cfg, 'GET', `/v1/entitlements/${APP}/${encodeURIComponent(accountId)}`)
}

export function startCheckout(
  cfg: PlansConfig,
  body: { workspace_id: string; billing: 'monthly' | 'yearly' },
): Promise<{ transaction_id: string; checkout_url: string | null }> {
  // Verba Pro has no extra-member add-on, so extra_members is always 0.
  return call(cfg, 'POST', '/v1/billing/checkout', { app: APP, plan: PAID_PLAN, extra_members: 0, ...body })
}

export function openPortal(cfg: PlansConfig, accountId: string): Promise<{ url: string }> {
  return call(cfg, 'POST', '/v1/billing/portal', { app: APP, workspace_id: accountId })
}
