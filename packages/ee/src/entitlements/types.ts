// Copyright (c) Nubisco: All Rights Reserved.
// See packages/ee/LICENSE for terms. Enterprise Edition only.
//
// Entitlements domain model: plans, subscriptions, entitlements, license state.

// ---------------------------------------------------------------------------
// Plans
// ---------------------------------------------------------------------------

/** All possible plan identifiers. */
export type PlanId =
  | 'oss_self_hosted' // Self-hosted OSS: free, no limits, no EE features
  | 'free' // Managed SaaS free tier: limited, no EE features
  | 'pro' // Managed SaaS Pro: higher limits, some EE features
  | 'business' // Managed SaaS Business: high limits, more EE features
  | 'enterprise' // Managed SaaS Enterprise: unlimited, all EE features
  | 'self_hosted_enterprise' // Self-hosted with active EE license key

export interface Plan {
  id: PlanId
  name: string
  /** Whether this plan is a managed SaaS plan (requires Stripe). */
  managed: boolean
  /** Whether this plan requires a signed license key (self-hosted EE). */
  requiresLicenseKey: boolean
  /** Base entitlements for this plan before any overrides are applied. */
  baseEntitlements: EntitlementSet
}

// ---------------------------------------------------------------------------
// Entitlements
// ---------------------------------------------------------------------------

/** Feature flags available in the entitlement system. */
export type EntitlementFeature =
  | 'sso' // SSO / SAML authentication
  | 'advanced_audit_export' // Export audit logs as CSV/JSON
  | 'multi_tenancy' // Organisation management
  | 'ai_suggestions' // AI translation suggestions
  | 'webhooks' // Outbound webhooks on translation events
  | 'api_tokens' // Personal API token generation
  | 'custom_roles' // Custom member roles beyond ADMIN/MAINTAINER/etc.
  | 'priority_support' // SLA-backed support tier

/** The resolved, effective set of entitlements for a workspace/org. */
export interface EntitlementSet {
  // Feature flags
  features: Set<EntitlementFeature>
  // Resource limits (null = unlimited)
  maxProjects: number | null
  maxSeatsPerProject: number | null
  maxKeysPerProject: number | null
  maxLocalesPerProject: number | null
  maxMonthlyApiCalls: number | null
}

/** A serialisable form of EntitlementSet (for JSON responses and DB storage). */
export interface EntitlementSetJson {
  features: EntitlementFeature[]
  maxProjects: number | null
  maxSeatsPerProject: number | null
  maxKeysPerProject: number | null
  maxLocalesPerProject: number | null
  maxMonthlyApiCalls: number | null
}

/** A manual override that changes specific entitlements for an org. */
export interface EntitlementOverride {
  orgId: string
  features?: EntitlementFeature[] // replaces the feature set if provided
  featureAdditions?: EntitlementFeature[] // merged onto the resolved feature set
  maxProjects?: number | null
  maxSeatsPerProject?: number | null
  maxKeysPerProject?: number | null
  maxLocalesPerProject?: number | null
  maxMonthlyApiCalls?: number | null
  note?: string // internal reason / Hubspot deal ID
  expiresAt?: Date | null
}

// ---------------------------------------------------------------------------
// Subscriptions (managed SaaS)
// ---------------------------------------------------------------------------

export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'canceled' | 'paused' | 'incomplete'

export interface Subscription {
  id: string
  orgId: string
  planId: PlanId
  status: SubscriptionStatus
  stripeSubscriptionId: string | null
  stripeCustomerId: string | null
  currentPeriodStart: Date | null
  currentPeriodEnd: Date | null
  cancelAtPeriodEnd: boolean
  createdAt: Date
  updatedAt: Date
}

// ---------------------------------------------------------------------------
// License state (self-hosted EE)
// ---------------------------------------------------------------------------

export type LicenseStatus =
  | 'none' // No license key present: OSS mode
  | 'valid' // Key present and valid
  | 'grace' // Key expired but within the grace period (offline/network error)
  | 'expired' // Key expired and grace period has elapsed
  | 'invalid' // Key present but signature or structure is invalid

export interface LicenseState {
  status: LicenseStatus
  licensee: string | null
  planId: PlanId | null
  seats: number | null
  features: EntitlementFeature[]
  expiresAt: Date | null
  graceEndsAt: Date | null
  lastVerifiedAt: Date | null
}

// ---------------------------------------------------------------------------
// Resolved entitlement context (runtime)
// ---------------------------------------------------------------------------

/**
 * The full entitlement context resolved for a given org at request time.
 * This is what the entitlement service returns and what guards consume.
 */
export interface EntitlementContext {
  orgId: string | null
  plan: Plan
  subscription: Subscription | null
  licenseState: LicenseState
  entitlements: EntitlementSet
  /** True when entitlements come from an active override. */
  hasOverride: boolean
}
