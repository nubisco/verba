// Copyright (c) Nubisco: All Rights Reserved.
// See packages/ee/LICENSE for terms. Enterprise Edition only.

/**
 * Hosted plans and billing: where the deployment's settings live.
 *
 * Plans only switch on when the deployment can reach Nubisco's licenses
 * service (VERBA_LICENSES_URL and VERBA_LICENSES_SERVICE_TOKEN). Without them
 * every account resolves exactly as before (no limits from billing, no billing
 * routes, no billing page), so a self-hosted Community or Enterprise instance
 * is untouched.
 */

export interface PlansConfig {
  licensesUrl: string
  serviceToken: string
  /** HMAC key for entitlement.updated. Unset, the webhook route answers 404. */
  webhookSecret: string | null
  /** Where "Contact sales" points, if anywhere. */
  salesUrl: string | null
  fetchImpl: typeof fetch
}

let config: PlansConfig | null = null

export function plansConfig(): PlansConfig | null {
  return config
}

/** Reads the deployment's variables. Null when billing is not set up. */
export function configFromEnv(
  env: Record<string, string | undefined> = {},
  fetchImpl: typeof fetch = fetch,
): PlansConfig | null {
  const licensesUrl = env.VERBA_LICENSES_URL?.trim()
  const serviceToken = env.VERBA_LICENSES_SERVICE_TOKEN?.trim()
  if (!licensesUrl || !serviceToken) return null
  return {
    licensesUrl: licensesUrl.replace(/\/+$/, ''),
    serviceToken,
    webhookSecret: env.VERBA_ENTITLEMENT_WEBHOOK_SECRET?.trim() || null,
    salesUrl: env.VERBA_SALES_URL?.trim() || null,
    // Called as cfg.fetchImpl(...), the global fetch would get cfg as `this`,
    // which some runtimes reject with "Illegal invocation" (Acta hit it on
    // Workers). Calling it as a plain function keeps `this` unset, the way
    // fetch expects to be called.
    fetchImpl: ((input, init) => fetchImpl(input, init)) as typeof fetch,
  }
}

/** Set once when the billing routes mount. Tests set and clear it directly. */
export function configurePlans(next: PlansConfig | null): void {
  config = next
}
