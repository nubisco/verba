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

async function verifyPlatformJwt(
  token: string,
  issuer: string,
): Promise<{ email: string; role: string; sub: string; exp: number; iss: string } | null> {
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
  const claims = JSON.parse(new TextDecoder().decode(new Uint8Array(b64urlDecode(p)))) as {
    email: string
    role: string
    sub: string
    exp: number
    iss: string
  }
  if (claims.exp < Math.floor(Date.now() / 1000) || claims.iss !== issuer) return null
  return claims
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Verify a Nubisco Platform JWT and return the corresponding local user id.
 * Upserts the user by email on first login.
 * Returns null if platform auth is not configured or the token is invalid.
 */
export async function verifyPlatformToken(token: string): Promise<{ userId: string; email: string } | null> {
  const issuer = process.env.PLATFORM_ISSUER
  if (!issuer) return null

  const claims = await verifyPlatformJwt(token, issuer)
  if (!claims) return null

  const email = claims.email.toLowerCase().trim()

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    if (existing.deactivatedAt != null) return null
    return { userId: existing.id, email: existing.email }
  }

  // Auto-provision on first platform login
  const isFirstUser = (await prisma.user.count()) === 0
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: '',
      name: claims.email.split('@')[0],
      isGlobalAdmin: isFirstUser,
    },
    select: { id: true, email: true },
  })

  return { userId: user.id, email: user.email }
}

/** Returns true when platform auth is configured. */
export function isPlatformAuthEnabled(): boolean {
  return Boolean(process.env.PLATFORM_ISSUER)
}
