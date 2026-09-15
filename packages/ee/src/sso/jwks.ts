// Copyright (c) Nubisco: All Rights Reserved.
// See packages/ee/LICENSE for terms. Enterprise Edition only.
//
// RS256 JWT verification against a provider's published JWKS.
//
// Shared by both federation modes. An OIDC id_token and a Nubisco Platform
// handover token are both RS256 JWTs signed by the issuer, so they are
// verified by the same code; they differ only in how the token was obtained
// and in the extra checks OIDC layers on top (audience and nonce, applied by
// the caller in `oidc.ts`).

export interface SsoClaims {
  sub: string
  email: string
  name?: string
  role?: string
  iat: number
  exp: number
  iss: string
  /** OIDC id_tokens only: the client the token was minted for. */
  aud?: string | string[]
  /** OIDC id_tokens only: binds the token to one sign-in attempt. */
  nonce?: string
  /** Nubisco Platform handover tokens carry the caller's plan. */
  app_plan?: string
  [key: string]: unknown
}

interface JwkKey extends JsonWebKey {
  kid: string
}

interface JwtHeader {
  alg: string
  kid?: string
}

function base64urlDecode(input: string): ArrayBuffer {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/')
  const padLen = (4 - (padded.length % 4)) % 4
  const binary = atob(padded + '='.repeat(padLen))
  return Uint8Array.from(binary, (c) => c.charCodeAt(0)).buffer as ArrayBuffer
}

function base64urlToUtf8(input: string): string {
  return new TextDecoder().decode(new Uint8Array(base64urlDecode(input)))
}

export class JwksVerifier {
  private readonly issuer: string
  private readonly jwksUri: string
  private readonly cacheTtlMs: number
  private readonly fetchImpl: typeof fetch
  private jwksCache: { keys: JwkKey[]; fetchedAt: number } | null = null
  private importedKeys = new Map<string, CryptoKey>()

  constructor(
    issuer: string,
    opts: {
      cacheTtlMs?: number
      fetchImpl?: typeof fetch
      /**
       * Where the keys actually live. The Platform handover contract fixes
       * this at `${issuer}/.well-known/jwks.json`, but an OIDC provider names
       * it in its discovery document and is under no obligation to put it
       * there: Entra and Auth0 both serve keys from a different path.
       */
      jwksUri?: string
    } = {},
  ) {
    this.issuer = issuer.replace(/\/$/, '')
    this.jwksUri = opts.jwksUri ?? `${this.issuer}/.well-known/jwks.json`
    this.cacheTtlMs = opts.cacheTtlMs ?? 300_000
    this.fetchImpl = (opts.fetchImpl ?? globalThis.fetch).bind(globalThis)
  }

  private async fetchJwks(): Promise<JwkKey[]> {
    const now = Date.now()
    if (this.jwksCache && now - this.jwksCache.fetchedAt < this.cacheTtlMs) {
      return this.jwksCache.keys
    }
    const res = await this.fetchImpl(this.jwksUri)
    if (!res.ok) throw new Error(`Failed to fetch JWKS: ${res.status}`)
    const data = (await res.json()) as { keys: JwkKey[] }
    this.jwksCache = { keys: data.keys, fetchedAt: now }
    this.importedKeys.clear()
    return data.keys
  }

  private async getVerifyKey(kid: string): Promise<CryptoKey> {
    const cached = this.importedKeys.get(kid)
    if (cached) return cached
    let jwk = (await this.fetchJwks()).find((k) => k.kid === kid)
    if (!jwk) {
      // Key rotation: refetch once before giving up, so a provider rolling its
      // signing key does not lock everyone out until the cache expires.
      this.jwksCache = null
      jwk = (await this.fetchJwks()).find((k) => k.kid === kid)
      if (!jwk) throw new Error(`No JWKS key found for kid: ${kid}`)
    }
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, [
      'verify',
    ])
    this.importedKeys.set(jwk.kid, key)
    return key
  }

  async verify(token: string): Promise<SsoClaims> {
    const parts = token.split('.')
    if (parts.length !== 3) throw new Error('Malformed JWT')
    const [headerB64, payloadB64, signatureB64] = parts as [string, string, string]

    // Parsed defensively: three dot-separated pieces is not enough to make
    // something a JWT, and a raw "Unexpected token" from JSON.parse is a poor
    // thing to find in a log that is, by design, the only place the reason for
    // a failed sign-in ever appears.
    let header: JwtHeader
    try {
      header = JSON.parse(base64urlToUtf8(headerB64)) as JwtHeader
    } catch {
      throw new Error('Malformed JWT: header is not valid JSON')
    }
    // Pinned to RS256 rather than read from the token. Honouring the header's
    // choice of algorithm is the classic JWT forgery: `alg: none` accepts an
    // unsigned token, and an HMAC alg lets the public key double as the
    // shared secret.
    if (header.alg !== 'RS256') throw new Error(`Unsupported algorithm: ${header.alg}`)
    if (!header.kid) throw new Error('JWT missing kid')

    const key = await this.getVerifyKey(header.kid)
    const valid = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      key,
      base64urlDecode(signatureB64),
      new TextEncoder().encode(`${headerB64}.${payloadB64}`),
    )
    if (!valid) throw new Error('JWT signature verification failed')

    let claims: SsoClaims
    try {
      claims = JSON.parse(base64urlToUtf8(payloadB64)) as SsoClaims
    } catch {
      throw new Error('Malformed JWT: payload is not valid JSON')
    }
    if (claims.exp < Math.floor(Date.now() / 1000)) throw new Error('JWT expired')
    if (claims.iss !== this.issuer) throw new Error(`JWT issuer mismatch: expected ${this.issuer}`)
    // The email is how a token becomes a Verba user, so a token without one
    // authenticates somebody we then cannot place.
    if (!claims.email) throw new Error('JWT missing email claim')
    return claims
  }
}
