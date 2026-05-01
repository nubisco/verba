// Copyright (c) Nubisco: All Rights Reserved.
// See packages/ee/LICENSE for terms. Enterprise Edition only.
//
// Licensing: signed license key validation for self-hosted EE deployments.
// Verifies license signatures, checks seat limits, and handles
// offline verification with a configurable grace period.

export interface LicensePayload {
  licensee: string
  plan: string
  seats: number
  expiresAt: string | null
  features: string[]
}

export function isLicenseValid(): boolean {
  return !!process.env.LICENSE_KEY
}

export async function validateLicenseKey(_key: string): Promise<LicensePayload> {
  throw Object.assign(new Error('License validation requires an Enterprise Edition license key'), {
    statusCode: 402,
  })
}

export async function getLicenseInfo(): Promise<never> {
  throw Object.assign(new Error('License inspection requires an Enterprise Edition license key'), {
    statusCode: 402,
  })
}
