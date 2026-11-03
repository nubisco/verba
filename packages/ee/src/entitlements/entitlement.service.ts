// Copyright (c) Nubisco: All Rights Reserved.
// See packages/ee/LICENSE for terms. Enterprise Edition only.
//
// Entitlement resolution service.
// Resolves the effective EntitlementContext for a given org (an Account id) by
// merging:
//   1. Base plan entitlements
//   2. On a hosted instance with billing configured, the account's plan and
//      limits from Nubisco's licenses service (src/plans)
//   3. License-derived features (self-hosted EE)
//   4. Manual EntitlementOverride (if any)
//
// OSS self-hosted mode works without any billing provider or license key.

import type {
  EntitlementContext,
  EntitlementFeature,
  EntitlementOverride,
  EntitlementSet,
  EntitlementSetJson,
  LicenseState,
  LicenseStatus,
  HostedBillingState,
  PlanId,
  Subscription,
} from './types.js'
import { getPlan, getDefaultPlan } from './plans.js'
import { plansConfig } from '../plans/config.js'
import { applyHostedLimits, hostedPlanId } from '../plans/limits.js'
import { planFor, type PlanRow, type PlansDb } from '../plans/store.js'

// ---------------------------------------------------------------------------
// Database access
// ---------------------------------------------------------------------------

/**
 * The part of the API's Prisma client this service reads. The generated
 * client lives in apps/api (Prisma 7 no longer generates into
 * `@prisma/client`), so EE describes the shape it needs instead of importing
 * it, and the API passes its client in.
 */
export interface EntitlementsDb extends PlansDb {
  entitlementOverride: {
    findUnique(args: { where: { orgId: string } }): Promise<EntitlementOverrideRow | null>
  }
  licenseState: {
    findFirst(args: { where: { orgId: string | null } }): Promise<LicenseStateRow | null>
  }
}

interface EntitlementOverrideRow {
  orgId: string
  features: string | null
  featureAdditions: string | null
  maxProjects: number | null
  maxSeatsPerProject: number | null
  maxKeysPerProject: number | null
  maxLocalesPerProject: number | null
  maxMonthlyApiCalls: number | null
  note: string | null
  expiresAt: Date | null
}

interface LicenseStateRow {
  status: string
  licensee: string | null
  planId: string | null
  seats: number | null
  features: string
  expiresAt: Date | null
  graceEndsAt: Date | null
  lastVerifiedAt: Date | null
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Resolve the effective entitlement context for an org.
 * Pass `orgId = null` for single-org / OSS installs that have no org model.
 */
export async function resolveEntitlements(prisma: EntitlementsDb, orgId: string | null): Promise<EntitlementContext> {
  const [override, licenseState] = await Promise.all([
    orgId ? loadOverride(prisma, orgId) : null,
    loadLicenseState(prisma, orgId),
  ])

  // Hosted billing: only when the licenses service is configured, for an
  // account, and no self-hosted licence key decides the plan instead.
  const keyDecides = (licenseState.status === 'valid' || licenseState.status === 'grace') && !!licenseState.planId
  const hosted = plansConfig() && orgId && !keyDecides ? await planFor(prisma, orgId) : undefined

  // Determine active plan
  const plan = hosted !== undefined ? getPlan(hostedPlanId(hosted)) : resolvePlan(licenseState)

  // Start from base entitlements
  let entitlements: EntitlementSet = cloneEntitlementSet(plan.baseEntitlements)
  if (hosted !== undefined) entitlements = applyHostedLimits(entitlements, hosted)

  // Merge license-derived feature additions (self-hosted EE key may grant extras)
  if (licenseState.status === 'valid' || licenseState.status === 'grace') {
    for (const f of licenseState.features) {
      entitlements.features.add(f)
    }
  }

  // Apply override (takes precedence over everything)
  let hasOverride = false
  if (override && (!override.expiresAt || override.expiresAt > new Date())) {
    hasOverride = true
    entitlements = applyOverride(entitlements, override)
  }

  return {
    orgId,
    plan,
    subscription: hosted ? subscriptionOf(hosted) : null,
    licenseState,
    entitlements,
    hasOverride,
    billing: hosted !== undefined ? billingStateOf(hosted) : null,
  }
}

/**
 * Check whether an org has a specific feature entitlement.
 * Convenience wrapper: resolves the full context internally.
 */
export async function hasFeature(
  prisma: EntitlementsDb,
  orgId: string | null,
  feature: EntitlementFeature,
): Promise<boolean> {
  const ctx = await resolveEntitlements(prisma, orgId)
  return ctx.entitlements.features.has(feature)
}

/**
 * Serialise an EntitlementSet to a plain JSON-safe object.
 */
export function serializeEntitlements(set: EntitlementSet): EntitlementSetJson {
  return {
    features: Array.from(set.features),
    maxProjects: set.maxProjects,
    maxMembers: set.maxMembers,
    maxKeys: set.maxKeys,
    maxLocales: set.maxLocales,
    maxSeatsPerProject: set.maxSeatsPerProject,
    maxKeysPerProject: set.maxKeysPerProject,
    maxLocalesPerProject: set.maxLocalesPerProject,
    maxMonthlyApiCalls: set.maxMonthlyApiCalls,
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function resolvePlan(licenseState: LicenseState): ReturnType<typeof getPlan> {
  // Self-hosted EE: valid/grace license key takes precedence
  if ((licenseState.status === 'valid' || licenseState.status === 'grace') && licenseState.planId) {
    return getPlan(licenseState.planId as PlanId)
  }

  // Default: OSS self-hosted (no billing, no license)
  return getDefaultPlan()
}

function dateOrNull(iso: string | null | undefined): Date | null {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d
}

function subscriptionOf(row: PlanRow): Subscription | null {
  const sub = row.subscription
  if (!sub) return null
  const endsAt = dateOrNull(sub.ends_at)
  return {
    planId: sub.plan,
    status: sub.status,
    billing: sub.billing,
    currentPeriodEnd: dateOrNull(sub.current_period_end),
    cancelAtPeriodEnd: endsAt !== null,
    endsAt,
    graceUntil: dateOrNull(sub.grace_until),
  }
}

function billingStateOf(row: PlanRow | null): HostedBillingState {
  return {
    state: row?.state ?? 'free',
    source: row?.source ?? 'free',
    version: row?.version ?? null,
    fetchedAt: row?.fetchedAt ?? null,
  }
}

function cloneEntitlementSet(set: EntitlementSet): EntitlementSet {
  return {
    features: new Set(set.features),
    maxProjects: set.maxProjects,
    maxMembers: set.maxMembers,
    maxKeys: set.maxKeys,
    maxLocales: set.maxLocales,
    maxSeatsPerProject: set.maxSeatsPerProject,
    maxKeysPerProject: set.maxKeysPerProject,
    maxLocalesPerProject: set.maxLocalesPerProject,
    maxMonthlyApiCalls: set.maxMonthlyApiCalls,
  }
}

function applyOverride(base: EntitlementSet, override: EntitlementOverride): EntitlementSet {
  const result = cloneEntitlementSet(base)

  // features replaces the entire feature set
  if (override.features !== undefined) {
    result.features = new Set(override.features)
  }

  // featureAdditions are merged onto the resolved set
  if (override.featureAdditions) {
    for (const f of override.featureAdditions) {
      result.features.add(f)
    }
  }

  if (override.maxProjects !== undefined) result.maxProjects = override.maxProjects ?? null
  if (override.maxSeatsPerProject !== undefined) result.maxSeatsPerProject = override.maxSeatsPerProject ?? null
  if (override.maxKeysPerProject !== undefined) result.maxKeysPerProject = override.maxKeysPerProject ?? null
  if (override.maxLocalesPerProject !== undefined) result.maxLocalesPerProject = override.maxLocalesPerProject ?? null
  if (override.maxMonthlyApiCalls !== undefined) result.maxMonthlyApiCalls = override.maxMonthlyApiCalls ?? null

  return result
}

// ---------------------------------------------------------------------------
// DB loaders
// ---------------------------------------------------------------------------

async function loadOverride(prisma: EntitlementsDb, orgId: string): Promise<EntitlementOverride | null> {
  const row = await prisma.entitlementOverride.findUnique({ where: { orgId } })
  if (!row) return null
  return {
    orgId: row.orgId,
    features: row.features ? (JSON.parse(row.features) as EntitlementFeature[]) : undefined,
    featureAdditions: row.featureAdditions ? (JSON.parse(row.featureAdditions) as EntitlementFeature[]) : undefined,
    maxProjects: row.maxProjects ?? undefined,
    maxSeatsPerProject: row.maxSeatsPerProject ?? undefined,
    maxKeysPerProject: row.maxKeysPerProject ?? undefined,
    maxLocalesPerProject: row.maxLocalesPerProject ?? undefined,
    maxMonthlyApiCalls: row.maxMonthlyApiCalls ?? undefined,
    note: row.note ?? undefined,
    expiresAt: row.expiresAt ?? undefined,
  }
}

async function loadLicenseState(prisma: EntitlementsDb, orgId: string | null): Promise<LicenseState> {
  const where = orgId ? { orgId } : { orgId: null }
  const row = await prisma.licenseState.findFirst({ where })

  if (!row) {
    return {
      status: 'none',
      licensee: null,
      planId: null,
      seats: null,
      features: [],
      expiresAt: null,
      graceEndsAt: null,
      lastVerifiedAt: null,
    }
  }

  return {
    status: row.status as LicenseStatus,
    licensee: row.licensee,
    planId: row.planId as PlanId | null,
    seats: row.seats,
    features: JSON.parse(row.features) as EntitlementFeature[],
    expiresAt: row.expiresAt,
    graceEndsAt: row.graceEndsAt,
    lastVerifiedAt: row.lastVerifiedAt,
  }
}
