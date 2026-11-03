// Copyright (c) Nubisco: All Rights Reserved.
// See packages/ee/LICENSE for terms. Enterprise Edition only.

import { describe, it, expect } from 'vitest'
import { resolveEntitlements, hasFeature, serializeEntitlements } from './entitlement.service.js'
import { PLANS } from './plans.js'
import type { EntitlementsDb } from './entitlement.service.js'

// ---------------------------------------------------------------------------
// Minimal Prisma mock factory
// ---------------------------------------------------------------------------

function makePrisma(overrides: {
  entitlementOverride?: Record<string, unknown> | null
  licenseState?: Record<string, unknown> | null
}): EntitlementsDb {
  return {
    account: { findUnique: async () => null },
    accountPlan: {
      findUnique: async () => null,
      create: async () => null,
      updateMany: async () => ({ count: 0 }),
    },
    entitlementOverride: {
      findUnique: async () => overrides.entitlementOverride ?? null,
    },
    licenseState: {
      findFirst: async () => overrides.licenseState ?? null,
    },
  } as unknown as EntitlementsDb
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

  it('has the features every plan has, and no enterprise features', async () => {
    const prisma = makePrisma({})
    const ctx = await resolveEntitlements(prisma, null)
    expect([...ctx.entitlements.features].sort()).toEqual(['ai_suggestions', 'api_tokens', 'webhooks'])
    expect(ctx.entitlements.features.has('sso')).toBe(false)
  })

  it('hasFeature returns false for any EE feature', async () => {
    const prisma = makePrisma({})
    expect(await hasFeature(prisma, null, 'sso')).toBe(false)
    expect(await hasFeature(prisma, null, 'advanced_audit_export')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// An account on an instance without hosted billing
// ---------------------------------------------------------------------------

describe('an account without hosted billing configured', () => {
  it('resolves exactly as OSS self-hosted: no limits, no billing state', async () => {
    const prisma = makePrisma({})
    const ctx = await resolveEntitlements(prisma, 'acc_1')
    expect(ctx.plan.id).toBe('oss_self_hosted')
    expect(ctx.entitlements.maxProjects).toBeNull()
    expect(ctx.entitlements.maxMembers).toBeNull()
    expect(ctx.subscription).toBeNull()
    expect(ctx.billing).toBeNull()
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
    const prisma = makePrisma({ entitlementOverride: override })
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
    const prisma = makePrisma({ entitlementOverride: override })
    const ctx = await resolveEntitlements(prisma, 'org_4')
    // oss_self_hosted has no features, featureAdditions adds sso
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
    const prisma = makePrisma({ entitlementOverride: override })
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

// ---------------------------------------------------------------------------
// The plan table (Jose, 2026-11-03)
// ---------------------------------------------------------------------------

describe('the plan table', () => {
  it('has Free and Pro for hosted accounts, and Enterprise only as the licence plan', () => {
    expect(Object.keys(PLANS).sort()).toEqual(['free', 'oss_self_hosted', 'pro', 'self_hosted_enterprise'])
    expect(PLANS.self_hosted_enterprise.requiresLicenseKey).toBe(true)
  })

  it('locks no feature behind Pro: Free and Pro differ only by limits', () => {
    expect([...PLANS.free.baseEntitlements.features].sort()).toEqual([...PLANS.pro.baseEntitlements.features].sort())
  })

  it('holds Pro to the Paddle product, as account totals', () => {
    const pro = PLANS.pro.baseEntitlements
    expect([pro.maxProjects, pro.maxMembers, pro.maxKeys, pro.maxLocales]).toEqual([10, 25, 15000, null])
    expect([pro.maxSeatsPerProject, pro.maxKeysPerProject, pro.maxLocalesPerProject, pro.maxMonthlyApiCalls]).toEqual([
      null,
      null,
      null,
      null,
    ])
  })

  it('holds Free to its earlier caps, as account totals', () => {
    const free = PLANS.free.baseEntitlements
    expect([free.maxProjects, free.maxMembers, free.maxKeys, free.maxLocales]).toEqual([3, 5, 1500, 5])
    expect(free.maxKeysPerProject).toBeNull()
  })

  it('reads a licence key that names a plan this table lacks as Enterprise', async () => {
    const prisma = makePrisma({
      licenseState: {
        status: 'valid',
        licensee: 'Example Ltd',
        planId: 'enterprise',
        seats: 10,
        features: '[]',
        expiresAt: null,
        graceEndsAt: null,
        lastVerifiedAt: null,
      },
    })
    const ctx = await resolveEntitlements(prisma, null)
    expect(ctx.plan.id).toBe('self_hosted_enterprise')
  })
})
