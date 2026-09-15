// Copyright (c) Nubisco: All Rights Reserved.
// See packages/ee/LICENSE for terms. Enterprise Edition only.
//
// Federated sign-in. Two provider modes, one runtime:
//
//   `oidc`     the standard authorization-code flow, which is what every
//              off-the-shelf provider (Keycloak, Auth0, Okta, Entra, Google)
//              actually speaks.
//   `handover` Nubisco Platform's original contract, where the provider
//              redirects back with a signed JWT in the query.
//
// They differ only in how claims are obtained. Everything after that (mapping
// to a Verba user, provisioning, minting the local session) is shared by the
// API, deliberately: if provisioning drifted between the two, an instance
// would get different roles depending on how its provider happened to be wired.

import { JwksVerifier } from './jwks.js'
import { OidcClient, oidcConfigFromEnv, type OidcConfig } from './oidc.js'
import { handoverConfigFromEnv, type HandoverConfig } from './handover.js'

export { JwksVerifier, type SsoClaims } from './jwks.js'
export { OidcClient, oidcConfigFromEnv, type OidcConfig, type OidcHandshake } from './oidc.js'
export { handoverAuthorizeUrl, handoverConfigFromEnv, type HandoverConfig } from './handover.js'

export type SsoRuntime =
  | { mode: 'oidc'; config: OidcConfig; client: OidcClient }
  | { mode: 'handover'; config: HandoverConfig; verifier: JwksVerifier }

/**
 * Federated sign-in is an Enterprise Edition feature, so a licence key is
 * required before any provider is honoured. Local email one-time codes are
 * Community Edition and are never gated: an unlicensed instance always has a
 * way in, which is also what stops a lapsed licence locking everyone out.
 */
export function isSSOEnabled(): boolean {
  return !!process.env.LICENSE_KEY
}

/**
 * Build the runtime for whatever this instance has configured, or null.
 *
 * OIDC wins when both are configured: it is the standard one, and an instance
 * that has gone to the trouble of configuring a real provider did not mean to
 * keep the bespoke contract.
 */
export function ssoRuntimeFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  opts: { fetchImpl?: typeof fetch } = {},
): SsoRuntime | null {
  if (!isSSOEnabled()) return null

  const oidc = oidcConfigFromEnv(env)
  if (oidc) {
    return { mode: 'oidc', config: oidc, client: new OidcClient(oidc, { fetchImpl: opts.fetchImpl }) }
  }

  // Opt-in, unlike OIDC.
  //
  // Setting OIDC_ISSUER is itself a deliberate new act, and registering the
  // callback with that provider is part of the same setup. Platform handover
  // is not: an instance already signing in through the browser-driven flow has
  // PLATFORM_ISSUER and PLATFORM_APP_ID set, so honouring them here would move
  // it to the server-side flow the moment this code ships, and its callback
  // URI (`/api/auth/sso/callback`) is not the one registered on Platform
  // (`/login`). The result would be `redirect_uri_not_allowed` on a deployment
  // whose login worked five minutes earlier. Register the new URI first, then
  // set this.
  const handover = env.PLATFORM_SERVER_FLOW === 'true' ? handoverConfigFromEnv(env) : null
  if (handover) {
    return {
      mode: 'handover',
      config: handover,
      verifier: new JwksVerifier(handover.issuer, { fetchImpl: opts.fetchImpl }),
    }
  }

  return null
}

export async function handleSAMLCallback(_body: unknown): Promise<never> {
  throw Object.assign(new Error('SAML requires an Enterprise Edition license key'), {
    statusCode: 402,
  })
}
