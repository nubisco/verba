// Copyright (c) Nubisco: All Rights Reserved.
// See packages/ee/LICENSE for terms. Enterprise Edition only.

/**
 * What an account may hold under a plan from licenses.
 *
 * The limits come from the entitlement, which licenses builds from the Paddle
 * product's custom_data for a paid plan, from the plan table for Free, and from
 * a sales override when there is one. Verba keeps no plan numbers of its own
 * for a hosted account, so a change in Paddle needs no release here.
 */

import type { EntitlementSet, PlanId } from '../entitlements/types.js'
import type { PlanRow } from './store.js'

/** The limit keys licenses sends for Verba. */
export const LIMIT_KEYS = ['projects', 'keys', 'members', 'locales'] as const
export type LimitKey = (typeof LIMIT_KEYS)[number]

/**
 * What an account licenses has never been asked about is held to, when it
 * cannot be asked. Free as Jose set it on 2026-11-03, as account totals: the
 * same numbers as Verba's plan table and as Free in licenses
 * (src/billing/plans.ts), which answers them itself whenever it can be reached.
 */
export const FREE_LIMITS: Record<LimitKey, number | null> = { projects: 3, keys: 1500, members: 5, locales: 5 }

/**
 * The plan in Verba's table for a hosted account: Free, or Pro for any paid
 * access. A sales deal (licenses names it `enterprise`) has the same features
 * as Pro, and its limits come from its override in the entitlement.
 */
export function hostedPlanId(row: PlanRow | null): PlanId {
  return (row?.plan ?? 'free') === 'free' ? 'free' : 'pro'
}

/** The limits in force: the entitlement's, or Free's with no entitlement held. */
export function hostedLimits(row: PlanRow | null): Record<LimitKey, number | null> {
  const raw = row ? row.limits : FREE_LIMITS
  const out = {} as Record<LimitKey, number | null>
  for (const k of LIMIT_KEYS) {
    const v = raw[k]
    out[k] = typeof v === 'number' ? v : null
  }
  return out
}

/** The entitlement's limits written into the EntitlementSet the API reads. */
export function applyHostedLimits(set: EntitlementSet, row: PlanRow | null): EntitlementSet {
  const limits = hostedLimits(row)
  return {
    ...set,
    maxProjects: limits.projects,
    maxMembers: limits.members,
    maxKeys: limits.keys,
    maxLocales: limits.locales,
    // Paddle sells account-wide limits only. The per-project and API-call caps
    // of the old plan table do not apply to a hosted account.
    maxSeatsPerProject: null,
    maxKeysPerProject: null,
    maxLocalesPerProject: null,
    maxMonthlyApiCalls: null,
  }
}
