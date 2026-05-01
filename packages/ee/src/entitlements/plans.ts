// Copyright (c) Nubisco: All Rights Reserved.
// See packages/ee/LICENSE for terms. Enterprise Edition only.
//
// Plan definitions: base entitlements for each plan tier.

import type { Plan, PlanId } from './types.js'

const OSS_SELF_HOSTED: Plan = {
  id: 'oss_self_hosted',
  name: 'OSS Self-Hosted',
  managed: false,
  requiresLicenseKey: false,
  baseEntitlements: {
    features: new Set(),
    maxProjects: null,
    maxSeatsPerProject: null,
    maxKeysPerProject: null,
    maxLocalesPerProject: null,
    maxMonthlyApiCalls: null,
  },
}

const FREE: Plan = {
  id: 'free',
  name: 'Free',
  managed: true,
  requiresLicenseKey: false,
  baseEntitlements: {
    features: new Set(),
    maxProjects: 3,
    maxSeatsPerProject: 5,
    maxKeysPerProject: 500,
    maxLocalesPerProject: 5,
    maxMonthlyApiCalls: null,
  },
}

const PRO: Plan = {
  id: 'pro',
  name: 'Pro',
  managed: true,
  requiresLicenseKey: false,
  baseEntitlements: {
    features: new Set(['ai_suggestions', 'api_tokens', 'webhooks']),
    maxProjects: 10,
    maxSeatsPerProject: 20,
    maxKeysPerProject: 5000,
    maxLocalesPerProject: 20,
    maxMonthlyApiCalls: 10000,
  },
}

const BUSINESS: Plan = {
  id: 'business',
  name: 'Business',
  managed: true,
  requiresLicenseKey: false,
  baseEntitlements: {
    features: new Set(['ai_suggestions', 'api_tokens', 'webhooks', 'advanced_audit_export', 'custom_roles']),
    maxProjects: 50,
    maxSeatsPerProject: 100,
    maxKeysPerProject: null,
    maxLocalesPerProject: null,
    maxMonthlyApiCalls: 100000,
  },
}

const ENTERPRISE: Plan = {
  id: 'enterprise',
  name: 'Enterprise',
  managed: true,
  requiresLicenseKey: false,
  baseEntitlements: {
    features: new Set([
      'sso',
      'advanced_audit_export',
      'multi_tenancy',
      'ai_suggestions',
      'webhooks',
      'api_tokens',
      'custom_roles',
      'priority_support',
    ]),
    maxProjects: null,
    maxSeatsPerProject: null,
    maxKeysPerProject: null,
    maxLocalesPerProject: null,
    maxMonthlyApiCalls: null,
  },
}

const SELF_HOSTED_ENTERPRISE: Plan = {
  id: 'self_hosted_enterprise',
  name: 'Self-Hosted Enterprise',
  managed: false,
  requiresLicenseKey: true,
  baseEntitlements: {
    features: new Set([
      'sso',
      'advanced_audit_export',
      'multi_tenancy',
      'ai_suggestions',
      'webhooks',
      'api_tokens',
      'custom_roles',
      'priority_support',
    ]),
    maxProjects: null,
    maxSeatsPerProject: null,
    maxKeysPerProject: null,
    maxLocalesPerProject: null,
    maxMonthlyApiCalls: null,
  },
}

export const PLANS: Record<PlanId, Plan> = {
  oss_self_hosted: OSS_SELF_HOSTED,
  free: FREE,
  pro: PRO,
  business: BUSINESS,
  enterprise: ENTERPRISE,
  self_hosted_enterprise: SELF_HOSTED_ENTERPRISE,
}

export function getPlan(id: PlanId): Plan {
  return PLANS[id]
}

export function getDefaultPlan(): Plan {
  // When no billing is configured, default to OSS self-hosted
  return PLANS.oss_self_hosted
}
