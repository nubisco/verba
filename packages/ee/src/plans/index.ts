// Copyright (c) Nubisco: All Rights Reserved.
// See packages/ee/LICENSE for terms. Enterprise Edition only.

/**
 * Hosted plans and billing, through Nubisco's licenses service (Paddle is
 * merchant of record).
 *
 * - Each account's plan and limits come from the entitlement licenses keeps,
 *   cached in AccountPlan (store.ts) and read by resolveEntitlements.
 * - The billing routes and the entitlement webhook (routes.ts).
 *
 * Off until VERBA_LICENSES_URL and VERBA_LICENSES_SERVICE_TOKEN are set: then
 * plans resolve as they always have and the web app shows no billing.
 */

export { configFromEnv, configurePlans, plansConfig, type PlansConfig } from './config.js'
export {
  LicensesError,
  fetchEntitlement,
  openPortal,
  startCheckout,
  type LicensesEntitlement,
  type LicensesSubscription,
} from './client.js'
export { FREE_LIMITS, LIMIT_KEYS, hostedLimits, hostedPlanId, type LimitKey } from './limits.js'
export { hmacSha256Hex, signatureMatches } from './signature.js'
export { STALE_MS, applyEntitlement, cachedPlan, planFor, type PlanRow, type PlansDb } from './store.js'
export { checkoutPage, plansPlugin, type PlansDeps } from './routes.js'
export { accountLimits, type EnforcedResource } from './enforce.js'
