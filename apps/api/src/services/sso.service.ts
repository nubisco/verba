// Federated sign-in, wired to this API.
//
// The flow lives on the server, not in the browser. Verba's original platform
// sign-in built the authorize URL in the SPA and took the token back through
// the address bar, which is why `apps/web/src/utils/ssoToken.ts` exists at
// all: a live credential in `location.href` reaches browser history, the
// Referer of any third-party request the page makes, server access logs, and
// any analytics or error reporter that boots before it can be scrubbed. Doing
// both legs here means the code and the token never enter the page, and it is
// also the only way to hold a client secret, which confidential OIDC clients
// require.
//
// The engine itself is Enterprise Edition (`@nubisco/verba-ee`), loaded
// lazily so a Community Edition deployment boots without it and simply has no
// provider. Local email one-time codes are never gated.

import type { FastifyRequest } from 'fastify'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EeModule = any

/**
 * Lazy-loaded so the API boots in OSS mode without the EE package built, and
 * cached so discovery documents and JWKS survive between requests rather than
 * being refetched on every sign-in.
 */
let runtimePromise: Promise<EeModule | null> | null = null

async function loadEE(): Promise<EeModule | null> {
  try {
    return (await import('@nubisco/verba-ee')) as EeModule
  } catch {
    return null
  }
}

export function resetSsoRuntimeForTests(): void {
  runtimePromise = null
}

export async function getSsoRuntime(): Promise<EeModule | null> {
  if (!runtimePromise) {
    runtimePromise = (async () => {
      const ee = await loadEE()
      if (!ee?.ssoRuntimeFromEnv) return null
      try {
        return ee.ssoRuntimeFromEnv(process.env) ?? null
      } catch {
        return null
      }
    })()
  }
  return runtimePromise
}

export interface SsoPublicConfig {
  enabled: boolean
  mode: 'oidc' | 'handover' | null
  label: string | null
}

/** What the sign-in page needs to know: whether to offer a provider, and its name. */
export async function getSsoPublicConfig(): Promise<SsoPublicConfig> {
  const runtime = await getSsoRuntime()
  if (!runtime) return { enabled: false, mode: null, label: null }
  return { enabled: true, mode: runtime.mode, label: runtime.config.label }
}

// ── Public URLs ───────────────────────────────────────────────────────────────
//
// The provider redirects a browser, so both legs need absolute URLs, and the
// API cannot see its own public address: in the shipped deployment nginx
// proxies `/api/` here with the prefix stripped, so the request path alone is
// wrong by exactly that prefix. These derive the two origins from what an
// operator already configures, with an explicit override for anything unusual
// (a different prefix, a separate API hostname).

/** Where the browser reaches the SPA. */
export function publicWebUrl(): string {
  const origin = process.env.WEB_ORIGIN ?? process.env.CORS_ORIGIN ?? 'http://localhost:5173'
  return origin.replace(/\/$/, '')
}

/** Where the browser reaches this API. */
export function publicApiUrl(): string {
  const explicit = process.env.PUBLIC_API_URL
  if (explicit) return explicit.replace(/\/$/, '')
  if (process.env.NODE_ENV === 'production') return `${publicWebUrl()}/api`
  return `http://localhost:${process.env.PORT ?? 4000}`
}

/**
 * The redirect URI the provider must have registered. Derived rather than
 * configured so a deployment behind any hostname works without being told,
 * but it has to match the provider's whitelist byte for byte, which is why it
 * is built in exactly one place.
 */
export function ssoCallbackUrl(): string {
  return `${publicApiUrl()}/auth/sso/callback`
}

/** Back to the sign-in page, carrying a reason the page can render. */
export function loginErrorUrl(code: string): string {
  return `${publicWebUrl()}/login?error=${encodeURIComponent(code)}`
}

/**
 * Where to land after a successful sign-in.
 *
 * Only same-site paths are honoured. The target arrives as a query parameter
 * on a URL the provider round-trips, so treating it as a full URL would make
 * this an open redirect: an attacker could hand someone a Verba sign-in link
 * that deposits them, freshly authenticated, on a site of their choosing.
 */
export function safeLandingUrl(target: unknown): string {
  const fallback = `${publicWebUrl()}/projects`
  if (typeof target !== 'string' || !target.startsWith('/') || target.startsWith('//')) return fallback
  return `${publicWebUrl()}${target}`
}

/** Forwarded to the provider so a multi-account browser resolves the right person. */
export function loginHintOf(req: FastifyRequest): string | undefined {
  const hint = (req.query as { login_hint?: unknown })?.login_hint
  return typeof hint === 'string' && hint ? hint : undefined
}
