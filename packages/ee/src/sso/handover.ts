// Copyright (c) Nubisco: All Rights Reserved.
// See packages/ee/LICENSE for terms. Enterprise Edition only.
//
// Nubisco Platform's JWT handover contract, which predates its OIDC support.
// The provider authenticates the person and redirects back with a signed JWT
// in the query string rather than an authorization code:
//
//   GET ${authorizeUrl}?app_id=&redirect_uri=&state=
//   →  <redirect_uri>?token=<JWT>&state=<echoed>
//
// The JWT is RS256 with a `kid` in its header, verifiable against
// `${issuer}/.well-known/jwks.json`, carrying sub, email, iss and exp, and
// optionally name, role and app_plan.
//
// No off-the-shelf provider does this, so in practice it means Nubisco
// Platform. It is kept because it is what Platform's registered apps actually
// speak today: `nubisco-verba` is registered with `client_credentials` alone,
// so the OIDC authorization-code path would be refused with
// `unauthorized_client` until that registration is changed. If both modes are
// configured, OIDC wins.

export interface HandoverConfig {
  issuer: string
  authorizeUrl: string
  /** The slug Platform knows this deployment by, e.g. `nubisco-verba`. */
  appId: string
  /** Create Verba users on first login (the provider gates who gets a token). */
  autoProvision: boolean
  /** Shown on the sign-in button. */
  label: string
}

export function handoverConfigFromEnv(env: NodeJS.ProcessEnv = process.env): HandoverConfig | null {
  const issuer = env.PLATFORM_ISSUER?.replace(/\/$/, '')
  const appId = env.PLATFORM_APP_ID
  // Both, never one. An issuer with no app id used to fall back to the slug
  // `verba`, which no Platform app carries, so every sign-in returned
  // `unknown_app` and looked like an outage from the browser.
  if (!issuer || !appId) return null
  return {
    issuer,
    appId,
    authorizeUrl: env.PLATFORM_AUTHORIZE_URL ?? `${issuer}/api/auth/sso`,
    autoProvision: env.PLATFORM_AUTO_PROVISION !== 'false',
    label: env.PLATFORM_LABEL ?? 'Nubisco Platform',
  }
}

/** Where to send the browser to begin a handover sign-in. */
export function handoverAuthorizeUrl(
  config: HandoverConfig,
  redirectUri: string,
  state: string,
  opts: { loginHint?: string; prompt?: string } = {},
): string {
  const url = new URL(config.authorizeUrl)
  url.searchParams.set('app_id', config.appId)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('state', state)
  // The launchpad opens our launch URL with ?login_hint=<email>. Forwarding it
  // makes the user land as the account they actually clicked, which is what
  // keeps multi-account browsers from resolving the wrong person.
  if (opts.loginHint) url.searchParams.set('login_hint', opts.loginHint)
  if (opts.prompt) url.searchParams.set('prompt', opts.prompt)
  return url.toString()
}
