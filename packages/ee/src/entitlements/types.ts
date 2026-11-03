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
  /** Whether this plan is a hosted (managed SaaS) plan, billed through Nubisco's licenses service. */
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
  /** People in the account, across its projects. */
  maxMembers: number | null
  /** Translation keys across the account's projects. */
  maxKeys: number | null
  /** Distinct locales across the account's projects. */
  maxLocales: number | null
  maxSeatsPerProject: number | null
  maxKeysPerProject: number | null
  maxLocalesPerProject: number | null
  maxMonthlyApiCalls: number | null
}

/** A serialisable form of EntitlementSet (for JSON responses and DB storage). */
export interface EntitlementSetJson {
  features: EntitlementFeature[]
  maxProjects: number | null
  maxMembers: number | null
  maxKeys: number | null
  maxLocales: number | null
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
// Subscriptions (hosted, from the licenses service)
// ---------------------------------------------------------------------------

/**
 * The account's subscription as licenses reports it (Paddle is merchant of
 * record). Verba holds no billing provider ids: licenses owns them.
 */
export interface Subscription {
  planId: string
  /** Paddle's status: trialing, active, past_due, paused, canceled. */
  status: string
  billing: 'monthly' | 'yearly' | null
  currentPeriodEnd: Date | null
  /** True when a cancel is scheduled (endsAt is set). */
  cancelAtPeriodEnd: boolean
  endsAt: Date | null
  graceUntil: Date | null
}

/** Where a hosted account's plan came from, when billing is configured. */
export interface HostedBillingState {
  state: 'trialing' | 'active' | 'grace' | 'restricted' | 'free'
  source: 'subscription' | 'override' | 'free'
  /** The entitlement version held, or null when none could be fetched yet. */
  version: number | null
  fetchedAt: Date | null
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
  /** Set when the plan comes from the licenses service (hosted billing). */
  billing: HostedBillingState | null
}
