import { prisma } from '../prisma.js'

// ── Inline RS256/JWKS verification (no external deps) ────────────────────────

function b64urlDecode(s: string): ArrayBuffer {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/')
  const pad = (4 - (b64.length % 4)) % 4
  return Uint8Array.from(atob(b64 + '='.repeat(pad)), (c) => c.charCodeAt(0)).buffer as ArrayBuffer
}

let _jwksCache: { keys: Array<JsonWebKey & { kid: string }> } | null = null
let _jwksCacheAt = 0
const JWKS_TTL_MS = 5 * 60 * 1000

async function fetchJwks(issuer: string): Promise<{ keys: Array<JsonWebKey & { kid: string }> } | null> {
  const now = Date.now()
  if (_jwksCache && now - _jwksCacheAt < JWKS_TTL_MS) return _jwksCache
  try {
    const res = await fetch(`${issuer}/.well-known/jwks.json`)
    if (!res.ok) return null
    _jwksCache = (await res.json()) as { keys: Array<JsonWebKey & { kid: string }> }
    _jwksCacheAt = now
    return _jwksCache
  } catch {
    return null
  }
}

/**
 * Whether a Platform token was minted for this app.
 *
 * One issuer signs tokens for every Nubisco app, so the signature only proves
 * the person signed in somewhere. Handover tokens name the app by slug in
 * `app`, OAuth access tokens name it in `aud`. Either must equal the slug this
 * deployment is registered as (PLATFORM_APP_ID). Without the check, a token
 * for any other app was a Verba session, and its `app_plan` became the plan
 * Verba enforced.
 */
export function tokenNamesApp(claims: { app?: unknown; aud?: unknown }, appId: string | undefined): boolean {
  if (!appId) return false
  if (claims.app === appId) return true
  const aud = claims.aud
  return aud === appId || (Array.isArray(aud) && aud.includes(appId))
}

type PlatformClaims = {
  email: string
  role: string
  sub: string
  exp: number
  iss: string
  app?: string
  aud?: string | string[]
  app_plan?: string
  app_entitlements?: Record<string, unknown>
  picture?: string
}

export async function verifyPlatformJwt(
  token: string,
  issuer: string,
  appId: string | undefined,
): Promise<PlatformClaims | null> {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [h, p, s] = parts as [string, string, string]
  const header = JSON.parse(new TextDecoder().decode(new Uint8Array(b64urlDecode(h)))) as {
    alg: string
    kid?: string
  }
  if (header.alg !== 'RS256' || !header.kid) return null
  const jwks = await fetchJwks(issuer)
  if (!jwks) return null
  const jwk = jwks.keys.find((k) => k.kid === header.kid)
  if (!jwk) return null
  let key: CryptoKey
  try {
    key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify'])
  } catch {
    return null
  }
  const valid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    key,
    b64urlDecode(s),
    new TextEncoder().encode(`${h}.${p}`),
  )
  if (!valid) return null
  const claims = JSON.parse(new TextDecoder().decode(new Uint8Array(b64urlDecode(p)))) as PlatformClaims
  if (claims.exp < Math.floor(Date.now() / 1000) || claims.iss !== issuer) return null
  if (!tokenNamesApp(claims, appId)) return null
  if (!claims.email) return null
  return claims
}

// ── Avatar ────────────────────────────────────────────────────────────────────

/**
 * The avatar a person carries in from their provider, or null for none.
 *
 * Platform puts a public URL in the OIDC `picture` claim and omits the claim
 * when someone has no avatar (platform docs, guide/avatars.md). The value ends
 * up as an <img src> in the rail, so it is checked rather than trusted: only an
 * address on the issuer's own origin under `/api/avatars/` is kept, as Acta
 * does. The token is signed, so this is not the defence against forgery. It
 * stops a provider change or a misconfiguration from pointing every Verba page
 * at some third-party host.
 */
export function acceptedPicture(value: unknown, issuer: string | undefined): string | null {
  if (typeof value !== 'string' || value === '' || !issuer) return null
  let url: URL
  let origin: string
  try {
    url = new URL(value)
    origin = new URL(issuer).origin
  } catch {
    return null
  }
  if (url.origin !== origin) return null
  if (!url.pathname.startsWith('/api/avatars/')) return null
  // Credentials in the URL would be sent by the browser on every page that
  // renders the avatar, and would sit in the database in plain text.
  if (url.username || url.password) return null
  return url.toString()
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface ResolvedIdentity {
  userId: string
  email: string
  plan: string
  platformSub: string
  name: string | null
  // True when this call auto-provisioned a local Verba user (first sign-in).
  created: boolean
}

/**
 * Map verified provider claims onto a local Verba user.
 *
 * Shared by every federation mode. The difference between a JWT handed over in
 * the query, an id_token fetched through a code exchange, and a token posted
 * to the legacy callback ends at the claims; if provisioning drifted between
 * them, the same person would get a different account depending on how their
 * provider happened to be wired.
 *
 * `autoProvision: false` means users must exist in Verba first, and someone
 * unknown gets null rather than an account.
 */
export async function upsertUserFromClaims(
  claims: { sub: string; email: string; name?: string; app_plan?: string; iss?: string; picture?: unknown },
  opts: { autoProvision?: boolean } = {},
): Promise<ResolvedIdentity | null> {
  const email = claims.email.toLowerCase().trim()
  const plan = claims.app_plan ?? 'free'
  // Every sign-in refreshes the avatar, and an absent claim clears it: the
  // provider omits `picture` for someone with no avatar. `iss` has already
  // been checked against the configured issuer by whoever verified the token.
  const avatarUrl = acceptedPicture(claims.picture, claims.iss)

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    if (existing.deactivatedAt != null) return null
    if (existing.avatarUrl !== avatarUrl) {
      await prisma.user.update({ where: { id: existing.id }, data: { avatarUrl } })
    }
    return {
      userId: existing.id,
      email: existing.email,
      plan,
      platformSub: claims.sub,
      name: existing.name,
      created: false,
    }
  }

  if (opts.autoProvision === false) return null

  // Nobody becomes an operator by arriving first: see operator.service.ts.
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: '',
      name: claims.name ?? email.split('@')[0],
      isGlobalAdmin: false,
      avatarUrl,
    },
    select: { id: true, email: true, name: true },
  })

  return {
    userId: user.id,
    email: user.email,
    plan,
    platformSub: claims.sub,
    name: user.name,
    created: true,
  }
}

/**
 * Verify a Nubisco Platform JWT and return the corresponding local user id.
 * Upserts the user by email on first login.
 * Returns null if platform auth is not configured or the token is invalid.
 */
export async function verifyPlatformToken(token: string): Promise<{
  userId: string
  email: string
  plan: string
  platformSub: string
  name: string | null
  // True when this call auto-provisioned a local Verba user (first sign-in).
  created: boolean
} | null> {
  const issuer = process.env.PLATFORM_ISSUER
  const appId = process.env.PLATFORM_APP_ID
  // Both, never one: without the app id there is nothing to check the
  // audience against, and an unchecked token is any Nubisco app's token.
  if (!issuer || !appId) return null

  const claims = await verifyPlatformJwt(token, issuer, appId)
  if (!claims) return null

  return upsertUserFromClaims(claims)
}

/** Returns true when platform auth is configured (issuer and app id, together). */
export function isPlatformAuthEnabled(): boolean {
  return Boolean(process.env.PLATFORM_ISSUER && process.env.PLATFORM_APP_ID)
}
