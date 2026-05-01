// Copyright (c) Nubisco: All Rights Reserved.
// See packages/ee/LICENSE for terms. Enterprise Edition only.
//
// SSO / SAML: placeholder for EE SSO integration.
// Activation requires a valid LICENSE_KEY environment variable.

export function isSSOEnabled(): boolean {
  return !!process.env.LICENSE_KEY
}

export async function handleSAMLCallback(_body: unknown): Promise<never> {
  throw Object.assign(new Error('SSO requires an Enterprise Edition license key'), {
    statusCode: 402,
  })
}
