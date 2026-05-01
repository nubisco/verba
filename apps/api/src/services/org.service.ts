import { prisma } from '../prisma.js'
import type { CreateOrgInput } from '../schemas/org.schema.js'

export function isOrgsEnabled(): boolean {
  return process.env.ENABLE_ORGANIZATIONS === 'true'
}

function requireOrgsEnabled(): void {
  if (!isOrgsEnabled()) {
    throw Object.assign(new Error('Organizations feature is not enabled'), {
      statusCode: 501,
    })
  }
}

// ─── Limits (SaaS stubs) ─────────────────────────────────────────────────────
// These are intentionally simple stubs. In a SaaS deployment, replace these
// with checks against a billing/plan table or external entitlements API.
// OSS self-hosted: all limits return Infinity (no enforcement).

export type OrgPlan = 'free' | 'pro' | 'enterprise'

export interface OrgLimits {
  maxProjects: number
  maxMembers: number
  maxKeys: number
}

const PLAN_LIMITS: Record<OrgPlan, OrgLimits> = {
  free: { maxProjects: 3, maxMembers: 5, maxKeys: 500 },
  pro: { maxProjects: 20, maxMembers: 50, maxKeys: 10000 },
  enterprise: {
    maxProjects: Infinity,
    maxMembers: Infinity,
    maxKeys: Infinity,
  },
}

/** Returns the limits for an org. Override by setting ORG_PLAN env var (default: free). */
export function getOrgLimits(_orgId: string): OrgLimits {
  if (!isOrgsEnabled()) return PLAN_LIMITS.enterprise // no limits in OSS mode
  const plan = (process.env.ORG_PLAN ?? 'free') as OrgPlan
  return PLAN_LIMITS[plan] ?? PLAN_LIMITS.free
}

/** Stub for billing/upgrade hook. Replace with Stripe/LemonSqueezy integration. */
export async function getBillingPortalUrl(_orgId: string): Promise<string | null> {
  // In production, generate a Stripe billing portal session URL here.
  // For OSS self-hosted, return null (no billing).
  return null
}

// ─── Org CRUD ────────────────────────────────────────────────────────────────

export async function createOrg(userId: string, data: CreateOrgInput) {
  requireOrgsEnabled()
  const existing = await prisma.organization.findUnique({
    where: { slug: data.slug },
  })
  if (existing) throw Object.assign(new Error('Slug already taken'), { statusCode: 409 })

  const org = await prisma.organization.create({
    data: { name: data.name, slug: data.slug },
  })
  await prisma.orgMembership.create({
    data: { userId, orgId: org.id, role: 'OWNER' },
  })
  return org
}

export async function listOrgs(userId: string) {
  requireOrgsEnabled()
  const memberships = await prisma.orgMembership.findMany({
    where: { userId },
    include: { org: true },
  })
  return memberships.map((m) => m.org)
}

export async function getOrg(orgId: string, userId: string) {
  requireOrgsEnabled()
  const membership = await prisma.orgMembership.findUnique({
    where: { userId_orgId: { userId, orgId } },
    include: { org: true },
  })
  if (!membership)
    throw Object.assign(new Error('Organization not found'), {
      statusCode: 404,
    })
  const org = membership.org
  const limits = getOrgLimits(orgId)
  const billingUrl = await getBillingPortalUrl(orgId)
  return { ...org, limits, billingUrl }
}
