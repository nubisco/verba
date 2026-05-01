// Copyright (c) Nubisco. All Rights Reserved.
// See packages/ee/LICENSE for terms. Enterprise Edition only.
//
// Multi-tenancy / Organizations management. EE placeholder.
// Basic organization support (CE tier) lives in the CE codebase.

export function isMultiTenancyEnabled(): boolean {
  return !!process.env.LICENSE_KEY
}

export async function createOrganizationTier(_orgId: string, _tier: string): Promise<never> {
  throw Object.assign(new Error('Advanced multi-tenancy requires an Enterprise Edition license key'), {
    statusCode: 402,
  })
}
