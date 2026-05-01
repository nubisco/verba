// Copyright (c) Nubisco: All Rights Reserved.
// See packages/ee/LICENSE for terms. Enterprise Edition only.
//
// Entitlement resolution service.
// Resolves the effective EntitlementContext for a given org by merging:
//   1. Base plan entitlements
//   2. Manual EntitlementOverride (if any)
//   3. License-derived features (self-hosted EE)
//
// OSS self-hosted mode works without any billing provider or license key.

import type { PrismaClient } from '@prisma/client'
import type {
  EntitlementContext,
  EntitlementFeature,
  EntitlementOverride,
  EntitlementSet,
  EntitlementSetJson,
  LicenseState,
  LicenseStatus,
  PlanId,
  Subscription,
  SubscriptionStatus,
} from './types.js'
import { getPlan, getDefaultPlan } from './plans.js'

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Resolve the effective entitlement context for an org.
 * Pass `orgId = null` for single-org / OSS installs that have no org model.
 */
export async function resolveEntitlements(prisma: PrismaClient, orgId: string | null): Promise<EntitlementContext> {
  const [subscription, override, licenseState] = await Promise.all([
    orgId ? loadSubscription(prisma, orgId) : null,
    orgId ? loadOverride(prisma, orgId) : null,
    loadLicenseState(prisma, orgId),
  ])

  // Determine active plan
  const plan = resolvePlan(subscription, licenseState)

  // Start from base entitlements
  let entitlements: EntitlementSet = cloneEntitlementSet(plan.baseEntitlements)

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
    subscription,
    licenseState,
    entitlements,
    hasOverride,
  }
}

/**
 * Check whether an org has a specific feature entitlement.
 * Convenience wrapper: resolves the full context internally.
 */
export async function hasFeature(
  prisma: PrismaClient,
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
    maxSeatsPerProject: set.maxSeatsPerProject,
    maxKeysPerProject: set.maxKeysPerProject,
    maxLocalesPerProject: set.maxLocalesPerProject,
    maxMonthlyApiCalls: set.maxMonthlyApiCalls,
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function resolvePlan(subscription: Subscription | null, licenseState: LicenseState): ReturnType<typeof getPlan> {
  // Self-hosted EE: valid/grace license key takes precedence
  if ((licenseState.status === 'valid' || licenseState.status === 'grace') && licenseState.planId) {
    return getPlan(licenseState.planId as PlanId)
  }

  // Managed SaaS: use subscription plan
  if (subscription && subscription.status !== 'canceled') {
    return getPlan(subscription.planId as PlanId)
  }

  // Default: OSS self-hosted (no billing, no license)
  return getDefaultPlan()
}

function cloneEntitlementSet(set: EntitlementSet): EntitlementSet {
  return {
    features: new Set(set.features),
    maxProjects: set.maxProjects,
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

async function loadSubscription(prisma: PrismaClient, orgId: string): Promise<Subscription | null> {
  const row = await prisma.subscription.findUnique({ where: { orgId } })
  if (!row) return null
  return {
    id: row.id,
    orgId: row.orgId,
    planId: row.planId as PlanId,
    status: row.status as SubscriptionStatus,
    stripeSubscriptionId: row.stripeSubscriptionId,
    stripeCustomerId: row.stripeCustomerId,
    currentPeriodStart: row.currentPeriodStart,
    currentPeriodEnd: row.currentPeriodEnd,
    cancelAtPeriodEnd: row.cancelAtPeriodEnd,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

async function loadOverride(prisma: PrismaClient, orgId: string): Promise<EntitlementOverride | null> {
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

async function loadLicenseState(prisma: PrismaClient, orgId: string | null): Promise<LicenseState> {
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
