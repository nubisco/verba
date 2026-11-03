// Copyright (c) Nubisco: All Rights Reserved.
// See packages/ee/LICENSE for terms. Enterprise Edition only.
//
// Plan definitions: base entitlements for each plan tier.
//
// Hosted Verba has two plans, Free and Pro (Jose, 2026-11-03). They differ
// only by limits: every feature is on both, and AI on the customer's own key
// is never gated. The limits are account totals. For a hosted account the
// numbers in force come from Nubisco's licenses service (Pro's from the Paddle
// product), and the numbers here describe the same plans for everything else
// that reads this table. Larger deals are "contact sales": a sales override in
// licenses for a hosted account, or a licence key for a self-hosted one.

import type { EntitlementFeature, Plan, PlanId } from './types.js'

/** The features every plan has. Plans limit usage, they do not lock features. */
const EVERY_PLAN: EntitlementFeature[] = ['ai_suggestions', 'api_tokens', 'webhooks']

/** Enterprise features: held back for a licence key (or a sales override). */
const ENTERPRISE: EntitlementFeature[] = [
  ...EVERY_PLAN,
  'sso',
  'advanced_audit_export',
  'multi_tenancy',
  'custom_roles',
  'priority_support',
]

const UNLIMITED = {
  maxProjects: null,
  maxMembers: null,
  maxKeys: null,
  maxLocales: null,
  maxSeatsPerProject: null,
  maxKeysPerProject: null,
  maxLocalesPerProject: null,
  maxMonthlyApiCalls: null,
}

const OSS_SELF_HOSTED: Plan = {
  id: 'oss_self_hosted',
  name: 'OSS Self-Hosted',
  managed: false,
  requiresLicenseKey: false,
  baseEntitlements: { features: new Set(EVERY_PLAN), ...UNLIMITED },
}

const FREE: Plan = {
  id: 'free',
  name: 'Free',
  managed: true,
  requiresLicenseKey: false,
  baseEntitlements: {
    features: new Set(EVERY_PLAN),
    ...UNLIMITED,
    // Jose, 2026-11-03: account totals, the same as Free in licenses.
    maxProjects: 3,
    maxMembers: 5,
    maxKeys: 1500,
    maxLocales: 5,
  },
}

const PRO: Plan = {
  id: 'pro',
  name: 'Pro',
  managed: true,
  requiresLicenseKey: false,
  baseEntitlements: {
    features: new Set(EVERY_PLAN),
    ...UNLIMITED,
    // The Paddle product Verba Pro (custom_data limits).
    maxProjects: 10,
    maxMembers: 25,
    maxKeys: 15000,
    maxLocales: null,
  },
}

const SELF_HOSTED_ENTERPRISE: Plan = {
  id: 'self_hosted_enterprise',
  name: 'Enterprise',
  managed: false,
  requiresLicenseKey: true,
  baseEntitlements: { features: new Set(ENTERPRISE), ...UNLIMITED },
}

export const PLANS: Record<PlanId, Plan> = {
  oss_self_hosted: OSS_SELF_HOSTED,
  free: FREE,
  pro: PRO,
  self_hosted_enterprise: SELF_HOSTED_ENTERPRISE,
}

/** The plan, or undefined for an id this table does not have. */
export function getPlan(id: PlanId): Plan {
  return PLANS[id]
}

export function getDefaultPlan(): Plan {
  // When no billing is configured, default to OSS self-hosted
  return PLANS.oss_self_hosted
}
