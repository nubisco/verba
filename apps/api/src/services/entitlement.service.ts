// Thin wrapper that wires the EE entitlement service to the API's Prisma
// instance and provides Fastify preHandler helpers for route-level guards.
//
// Import boundaries: this file lives in the OSS API package but may import
// from the EE package. The EE package stubs return sensible OSS defaults, so
// the API always boots regardless of whether EE features are enabled.

import { prisma } from '../prisma.js'
import type { FastifyRequest, FastifyReply } from 'fastify'

// Lazy-load EE to allow the API to boot without the EE package being built.
// In production the EE package is always present; this guard is mainly for
// test environments that mock the service.
async function getEE() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return import('@nubisco/verba-ee') as Promise<any>
}

// ---------------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------------

/** Resolve the full entitlement context for a given org (or null for OSS). */
export async function getEntitlementContext(orgId: string | null) {
  const ee = await getEE()
  return ee.resolveEntitlements(prisma, orgId)
}

/** Return true if the given org has the requested feature entitlement. */
export async function orgHasFeature(orgId: string | null, feature: string): Promise<boolean> {
  const ee = await getEE()
  return ee.hasFeature(prisma, orgId, feature)
}

// ---------------------------------------------------------------------------
// Fastify preHandler factories
// ---------------------------------------------------------------------------

type OrgIdResolver = (req: FastifyRequest) => string | null | Promise<string | null>

/**
 * Returns a Fastify preHandler that gates a route behind a feature entitlement.
 *
 * Usage:
 *   app.get('/some-ee-route', { preHandler: [requireEntitlement('sso')] }, handler)
 *
 * @param feature   The EntitlementFeature string to require.
 * @param resolveOrgId  Optional fn to extract orgId from the request.
 *                  Defaults to null (single-org / OSS installs).
 */
export function requireEntitlement(feature: string, resolveOrgId: OrgIdResolver = () => null) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const orgId = await resolveOrgId(req)
    const entitled = await orgHasFeature(orgId, feature)
    if (!entitled) {
      return reply.status(402).send({
        error: 'Payment Required',
        feature,
        message: `This feature (${feature}) requires a paid plan or Enterprise license. See /admin/entitlements for your current plan.`,
      })
    }
  }
}

/** Serialize the entitlement context for API responses. */
export async function serializeEntitlementContext(orgId: string | null) {
  const ctx = await getEntitlementContext(orgId)
  const ee = await getEE()
  return {
    plan: {
      id: ctx.plan.id,
      name: ctx.plan.name,
      managed: ctx.plan.managed,
      requiresLicenseKey: ctx.plan.requiresLicenseKey,
    },
    entitlements: ee.serializeEntitlements(ctx.entitlements),
    licenseState: {
      status: ctx.licenseState.status,
      licensee: ctx.licenseState.licensee,
      planId: ctx.licenseState.planId,
      seats: ctx.licenseState.seats,
      expiresAt: ctx.licenseState.expiresAt,
      graceEndsAt: ctx.licenseState.graceEndsAt,
      lastVerifiedAt: ctx.licenseState.lastVerifiedAt,
    },
    subscription: ctx.subscription
      ? {
          planId: ctx.subscription.planId,
          status: ctx.subscription.status,
          currentPeriodEnd: ctx.subscription.currentPeriodEnd,
          cancelAtPeriodEnd: ctx.subscription.cancelAtPeriodEnd,
        }
      : null,
    hasOverride: ctx.hasOverride,
  }
}

/**
 * Returns a Fastify preHandler that enforces a resource limit.
 *
 * Usage:
 *   app.post('/projects', { preHandler: [requireWithinLimit('maxProjects', countFn)] }, handler)
 *
 * @param limitKey   Key of the limit on EntitlementSet (e.g. 'maxProjects').
 * @param getCurrent Async fn that returns the current count of the resource.
 * @param resolveOrgId Optional fn to extract orgId from the request.
 */
export function requireWithinLimit(
  limitKey: 'maxProjects' | 'maxSeatsPerProject' | 'maxKeysPerProject' | 'maxLocalesPerProject' | 'maxMonthlyApiCalls',
  getCurrent: (req: FastifyRequest) => number | Promise<number>,
  resolveOrgId: OrgIdResolver = () => null,
) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const orgId = await resolveOrgId(req)
    const ctx = await getEntitlementContext(orgId)
    const limit: number | null = ctx.entitlements[limitKey]

    if (limit === null) return // unlimited

    const current = await getCurrent(req)
    if (current >= limit) {
      return reply.status(402).send({
        error: 'Plan limit reached',
        limitKey,
        limit,
        current,
        message: `You have reached the ${limitKey} limit (${limit}) for your current plan. Upgrade to continue.`,
      })
    }
  }
}
