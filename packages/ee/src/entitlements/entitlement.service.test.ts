// Copyright (c) Nubisco: All Rights Reserved.
// See packages/ee/LICENSE for terms. Enterprise Edition only.

import { describe, it, expect } from 'vitest'
import { resolveEntitlements, hasFeature, serializeEntitlements } from './entitlement.service.js'
import type { PrismaClient } from '@prisma/client'

// ---------------------------------------------------------------------------
// Minimal Prisma mock factory
// ---------------------------------------------------------------------------

function makePrisma(overrides: {
  subscription?: Record<string, unknown> | null
  entitlementOverride?: Record<string, unknown> | null
  licenseState?: Record<string, unknown> | null
}): PrismaClient {
  return {
    subscription: {
      findUnique: async () => overrides.subscription ?? null,
    },
    entitlementOverride: {
      findUnique: async () => overrides.entitlementOverride ?? null,
    },
    licenseState: {
      findFirst: async () => overrides.licenseState ?? null,
    },
  } as unknown as PrismaClient
}

// ---------------------------------------------------------------------------
// OSS self-hosted (no billing, no license)
// ---------------------------------------------------------------------------

describe('oss_self_hosted', () => {
  it('resolves to oss_self_hosted plan with unlimited resources', async () => {
    const prisma = makePrisma({})
    const ctx = await resolveEntitlements(prisma, null)
    expect(ctx.plan.id).toBe('oss_self_hosted')
    expect(ctx.entitlements.maxProjects).toBeNull()
    expect(ctx.entitlements.maxSeatsPerProject).toBeNull()
    expect(ctx.entitlements.maxKeysPerProject).toBeNull()
    expect(ctx.entitlements.maxLocalesPerProject).toBeNull()
  })

  it('has no EE features by default', async () => {
    const prisma = makePrisma({})
    const ctx = await resolveEntitlements(prisma, null)
    expect(ctx.entitlements.features.size).toBe(0)
  })

  it('hasFeature returns false for any EE feature', async () => {
    const prisma = makePrisma({})
    expect(await hasFeature(prisma, null, 'sso')).toBe(false)
    expect(await hasFeature(prisma, null, 'advanced_audit_export')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Managed SaaS: free tier
// ---------------------------------------------------------------------------

describe('free managed SaaS', () => {
  const subscription = {
    id: 'sub_1',
    orgId: 'org_1',
    planId: 'free',
    status: 'active',
    stripeSubscriptionId: null,
    stripeCustomerId: null,
    currentPeriodStart: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  it('resolves free plan limits', async () => {
    const prisma = makePrisma({ subscription })
    const ctx = await resolveEntitlements(prisma, 'org_1')
    expect(ctx.plan.id).toBe('free')
    expect(ctx.entitlements.maxProjects).toBe(3)
    expect(ctx.entitlements.maxSeatsPerProject).toBe(5)
    expect(ctx.entitlements.features.size).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Managed SaaS: pro tier
// ---------------------------------------------------------------------------

describe('pro managed SaaS', () => {
  const subscription = {
    id: 'sub_2',
    orgId: 'org_2',
    planId: 'pro',
    status: 'active',
    stripeSubscriptionId: 'si_abc',
    stripeCustomerId: 'cus_abc',
    currentPeriodStart: new Date(),
    currentPeriodEnd: new Date(),
    cancelAtPeriodEnd: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  it('resolves pro plan limits and features', async () => {
    const prisma = makePrisma({ subscription })
    const ctx = await resolveEntitlements(prisma, 'org_2')
    expect(ctx.plan.id).toBe('pro')
    expect(ctx.entitlements.maxProjects).toBe(10)
    expect(ctx.entitlements.features.has('ai_suggestions')).toBe(true)
    expect(ctx.entitlements.features.has('webhooks')).toBe(true)
    expect(ctx.entitlements.features.has('sso')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Enterprise managed SaaS
// ---------------------------------------------------------------------------

describe('enterprise managed SaaS', () => {
  const subscription = {
    id: 'sub_3',
    orgId: 'org_3',
    planId: 'enterprise',
    status: 'active',
    stripeSubscriptionId: null,
    stripeCustomerId: null,
    currentPeriodStart: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  it('resolves enterprise plan with all features and unlimited resources', async () => {
    const prisma = makePrisma({ subscription })
    const ctx = await resolveEntitlements(prisma, 'org_3')
    expect(ctx.plan.id).toBe('enterprise')
    expect(ctx.entitlements.maxProjects).toBeNull()
    expect(ctx.entitlements.features.has('sso')).toBe(true)
    expect(ctx.entitlements.features.has('multi_tenancy')).toBe(true)
    expect(ctx.entitlements.features.has('priority_support')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Self-hosted EE with valid license key
// ---------------------------------------------------------------------------

describe('self_hosted_enterprise', () => {
  const licenseState = {
    id: 'lic_1',
    orgId: null,
    status: 'valid',
    licensee: 'Acme Corp',
    planId: 'self_hosted_enterprise',
    seats: 50,
    features: JSON.stringify(['sso', 'advanced_audit_export']),
    expiresAt: new Date(Date.now() + 365 * 24 * 3600 * 1000),
    graceEndsAt: null,
    lastVerifiedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  it('resolves self_hosted_enterprise plan', async () => {
    const prisma = makePrisma({ licenseState })
    const ctx = await resolveEntitlements(prisma, null)
    expect(ctx.plan.id).toBe('self_hosted_enterprise')
    expect(ctx.entitlements.maxProjects).toBeNull()
    expect(ctx.entitlements.features.has('sso')).toBe(true)
  })

  it('merges license features onto plan base entitlements', async () => {
    const prisma = makePrisma({ licenseState })
    const ctx = await resolveEntitlements(prisma, null)
    // advanced_audit_export is in license payload
    expect(ctx.entitlements.features.has('advanced_audit_export')).toBe(true)
  })

  it('grace status is still treated as valid', async () => {
    const prisma = makePrisma({
      licenseState: { ...licenseState, status: 'grace', graceEndsAt: new Date(Date.now() + 14 * 86400 * 1000) },
    })
    const ctx = await resolveEntitlements(prisma, null)
    expect(ctx.plan.id).toBe('self_hosted_enterprise')
  })

  it('expired status falls back to oss_self_hosted', async () => {
    const prisma = makePrisma({
      licenseState: { ...licenseState, status: 'expired' },
    })
    const ctx = await resolveEntitlements(prisma, null)
    expect(ctx.plan.id).toBe('oss_self_hosted')
  })
})

// ---------------------------------------------------------------------------
// EntitlementOverride
// ---------------------------------------------------------------------------

describe('EntitlementOverride', () => {
  const subscription = {
    id: 'sub_4',
    orgId: 'org_4',
    planId: 'free',
    status: 'active',
    stripeSubscriptionId: null,
    stripeCustomerId: null,
    currentPeriodStart: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  it('override replaces features when features field is set', async () => {
    const override = {
      id: 'ov_1',
      orgId: 'org_4',
      features: JSON.stringify(['sso', 'webhooks']),
      featureAdditions: null,
      maxProjects: null,
      maxSeatsPerProject: null,
      maxKeysPerProject: null,
      maxLocalesPerProject: null,
      maxMonthlyApiCalls: null,
      note: 'Sales deal',
      expiresAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    const prisma = makePrisma({ subscription, entitlementOverride: override })
    const ctx = await resolveEntitlements(prisma, 'org_4')
    expect(ctx.entitlements.features.has('sso')).toBe(true)
    expect(ctx.entitlements.features.has('webhooks')).toBe(true)
    expect(ctx.hasOverride).toBe(true)
  })

  it('featureAdditions are merged onto resolved features', async () => {
    const override = {
      id: 'ov_2',
      orgId: 'org_4',
      features: null,
      featureAdditions: JSON.stringify(['sso']),
      maxProjects: 99,
      maxSeatsPerProject: null,
      maxKeysPerProject: null,
      maxLocalesPerProject: null,
      maxMonthlyApiCalls: null,
      note: null,
      expiresAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    const prisma = makePrisma({ subscription, entitlementOverride: override })
    const ctx = await resolveEntitlements(prisma, 'org_4')
    // free has no features, featureAdditions adds sso
    expect(ctx.entitlements.features.has('sso')).toBe(true)
    expect(ctx.entitlements.maxProjects).toBe(99)
  })

  it('expired override is ignored', async () => {
    const override = {
      id: 'ov_3',
      orgId: 'org_4',
      features: JSON.stringify(['sso']),
      featureAdditions: null,
      maxProjects: null,
      maxSeatsPerProject: null,
      maxKeysPerProject: null,
      maxLocalesPerProject: null,
      maxMonthlyApiCalls: null,
      note: null,
      expiresAt: new Date(Date.now() - 1000), // expired
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    const prisma = makePrisma({ subscription, entitlementOverride: override })
    const ctx = await resolveEntitlements(prisma, 'org_4')
    expect(ctx.entitlements.features.has('sso')).toBe(false)
    expect(ctx.hasOverride).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// serializeEntitlements
// ---------------------------------------------------------------------------

describe('serializeEntitlements', () => {
  it('converts Set to array and preserves limits', async () => {
    const prisma = makePrisma({})
    const ctx = await resolveEntitlements(prisma, null)
    const json = serializeEntitlements(ctx.entitlements)
    expect(Array.isArray(json.features)).toBe(true)
    expect(json.maxProjects).toBeNull()
  })
})
