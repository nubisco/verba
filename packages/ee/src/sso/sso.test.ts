// Copyright (c) Nubisco: All Rights Reserved.
// See packages/ee/LICENSE for terms. Enterprise Edition only.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { generateKeyPairSync, createSign } from 'node:crypto'
import { JwksVerifier } from './jwks.js'
import { OidcClient, oidcConfigFromEnv } from './oidc.js'
import { handoverAuthorizeUrl, handoverConfigFromEnv } from './handover.js'
import { ssoRuntimeFromEnv } from './index.js'

const ISSUER = 'https://idp.example.com'

// A real RSA key, so the tests exercise the actual signature check rather than
// a stub of it. Verification is the whole point of this module: a fake that
// always says "valid" would pass every test here while accepting forged
// tokens in production.
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const KID = 'test-key-1'

function jwks(): { keys: unknown[] } {
  return { keys: [{ ...publicKey.export({ format: 'jwk' }), kid: KID, alg: 'RS256', use: 'sig' }] }
}

function b64url(input: string | Buffer): string {
  return Buffer.from(input).toString('base64url')
}

function signJwt(claims: Record<string, unknown>, opts: { alg?: string; kid?: string | null } = {}): string {
  const header: Record<string, unknown> = { alg: opts.alg ?? 'RS256', typ: 'JWT' }
  if (opts.kid !== null) header.kid = opts.kid ?? KID
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claims))}`
  const signer = createSign('RSA-SHA256')
  signer.update(signingInput)
  return `${signingInput}.${signer.sign(privateKey).toString('base64url')}`
}

function validClaims(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    sub: 'user-1',
    email: 'alice@example.com',
    name: 'Alice',
    iss: ISSUER,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 600,
    ...overrides,
  }
}

/** A fetch stub that serves discovery, JWKS and the token endpoint. */
function stubFetch(handlers: Record<string, () => Response>): typeof fetch {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    for (const [match, handler] of Object.entries(handlers)) {
      if (url.startsWith(match)) return handler()
    }
    return new Response('not found', { status: 404 })
  }) as unknown as typeof fetch
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

const discoveryDoc = {
  issuer: ISSUER,
  authorization_endpoint: `${ISSUER}/authorize`,
  token_endpoint: `${ISSUER}/token`,
  // Deliberately not the conventional path: Entra and Auth0 both serve keys
  // elsewhere, and the verifier must follow the document rather than guess.
  jwks_uri: `${ISSUER}/keys/rotating`,
}

describe('JwksVerifier', () => {
  it('accepts a correctly signed token', async () => {
    const verifier = new JwksVerifier(ISSUER, { fetchImpl: stubFetch({ [ISSUER]: () => json(jwks()) }) })
    const claims = await verifier.verify(signJwt(validClaims()))
    expect(claims.email).toBe('alice@example.com')
    expect(claims.sub).toBe('user-1')
  })

  it('rejects a token whose signature does not match', async () => {
    const verifier = new JwksVerifier(ISSUER, { fetchImpl: stubFetch({ [ISSUER]: () => json(jwks()) }) })
    const token = signJwt(validClaims())
    // Tamper with the payload, keeping the original signature.
    const [header, , signature] = token.split('.')
    const forged = `${header}.${b64url(JSON.stringify(validClaims({ email: 'attacker@example.com' })))}.${signature}`
    await expect(verifier.verify(forged)).rejects.toThrow(/signature/i)
  })

  // `alg: none` is the classic JWT forgery: honour the header's choice of
  // algorithm and an unsigned token verifies against nothing at all.
  it('refuses any algorithm but RS256', async () => {
    const verifier = new JwksVerifier(ISSUER, { fetchImpl: stubFetch({ [ISSUER]: () => json(jwks()) }) })
    const unsigned = `${b64url(JSON.stringify({ alg: 'none', kid: KID }))}.${b64url(JSON.stringify(validClaims()))}.`
    await expect(verifier.verify(unsigned)).rejects.toThrow(/Unsupported algorithm/)
  })

  it('rejects an expired token', async () => {
    const verifier = new JwksVerifier(ISSUER, { fetchImpl: stubFetch({ [ISSUER]: () => json(jwks()) }) })
    const expired = signJwt(validClaims({ exp: Math.floor(Date.now() / 1000) - 60 }))
    await expect(verifier.verify(expired)).rejects.toThrow(/expired/i)
  })

  it('rejects a token minted by a different issuer', async () => {
    const verifier = new JwksVerifier(ISSUER, { fetchImpl: stubFetch({ [ISSUER]: () => json(jwks()) }) })
    await expect(verifier.verify(signJwt(validClaims({ iss: 'https://evil.example.com' })))).rejects.toThrow(
      /issuer mismatch/i,
    )
  })

  it('rejects a token with no email, which cannot be mapped to a user', async () => {
    const verifier = new JwksVerifier(ISSUER, { fetchImpl: stubFetch({ [ISSUER]: () => json(jwks()) }) })
    const claims = validClaims()
    delete claims.email
    await expect(verifier.verify(signJwt(claims))).rejects.toThrow(/email/i)
  })

  it('names a malformed token as malformed, since the log is the only diagnostic', async () => {
    const verifier = new JwksVerifier(ISSUER, { fetchImpl: stubFetch({ [ISSUER]: () => json(jwks()) }) })
    // Three dot-separated pieces, so it survives the shape check and fails on
    // the header instead. This used to surface as "Unexpected token '\uFFFD'".
    await expect(verifier.verify('not.a.jwt')).rejects.toThrow(/Malformed JWT/)
    await expect(verifier.verify('a.b')).rejects.toThrow(/Malformed JWT/)
  })

  it('refetches the JWKS once when the key id is unknown, so rotation does not lock everyone out', async () => {
    let served = 0
    const fetchImpl = stubFetch({
      [ISSUER]: () => {
        served += 1
        // First response predates the rotation and lacks the signing key.
        return json(served === 1 ? { keys: [] } : jwks())
      },
    })
    const verifier = new JwksVerifier(ISSUER, { fetchImpl })
    const claims = await verifier.verify(signJwt(validClaims()))
    expect(claims.email).toBe('alice@example.com')
    expect(served).toBe(2)
  })
})

describe('OidcClient', () => {
  const config = {
    issuer: ISSUER,
    clientId: 'verba-client',
    clientSecret: 'sh/h+t=',
    scopes: ['openid', 'email', 'profile'],
    autoProvision: true,
    label: 'Acme SSO',
  }

  function client(extra: Record<string, () => Response> = {}) {
    return new OidcClient(config, {
      fetchImpl: stubFetch({
        [`${ISSUER}/.well-known/openid-configuration`]: () => json(discoveryDoc),
        [discoveryDoc.jwks_uri]: () => json(jwks()),
        ...extra,
      }),
    })
  }

  it('builds an authorize URL with PKCE, state and nonce', async () => {
    const { url, handshake } = await client().authorizeUrl('https://verba.example.com/auth/sso/callback')
    const parsed = new URL(url)
    expect(parsed.origin + parsed.pathname).toBe(`${ISSUER}/authorize`)
    expect(parsed.searchParams.get('response_type')).toBe('code')
    expect(parsed.searchParams.get('client_id')).toBe('verba-client')
    expect(parsed.searchParams.get('scope')).toBe('openid email profile')
    expect(parsed.searchParams.get('state')).toBe(handshake.state)
    expect(parsed.searchParams.get('nonce')).toBe(handshake.nonce)
    expect(parsed.searchParams.get('code_challenge_method')).toBe('S256')
    // The challenge is the hash, never the verifier itself: sending the
    // verifier would defeat the entire exercise.
    expect(parsed.searchParams.get('code_challenge')).toBeTruthy()
    expect(parsed.searchParams.get('code_challenge')).not.toBe(handshake.verifier)
  })

  it('exchanges a code and returns the id_token claims', async () => {
    const handshake = { state: 's', nonce: 'n-1', verifier: 'v' }
    const c = client({
      [discoveryDoc.token_endpoint]: () =>
        json({ id_token: signJwt(validClaims({ aud: 'verba-client', nonce: 'n-1' })) }),
    })
    const claims = await c.exchange('the-code', 'https://verba.example.com/cb', handshake)
    expect(claims.email).toBe('alice@example.com')
  })

  // Without this, an id_token minted for a different client at the same
  // issuer would sign that person into Verba.
  it('rejects an id_token minted for another client', async () => {
    const handshake = { state: 's', nonce: 'n-1', verifier: 'v' }
    const c = client({
      [discoveryDoc.token_endpoint]: () =>
        json({ id_token: signJwt(validClaims({ aud: 'some-other-app', nonce: 'n-1' })) }),
    })
    await expect(c.exchange('the-code', 'https://verba.example.com/cb', handshake)).rejects.toThrow(/audience/i)
  })

  // Without this, a token captured from an earlier sign-in could be replayed.
  it('rejects an id_token belonging to a different sign-in', async () => {
    const handshake = { state: 's', nonce: 'n-current', verifier: 'v' }
    const c = client({
      [discoveryDoc.token_endpoint]: () =>
        json({ id_token: signJwt(validClaims({ aud: 'verba-client', nonce: 'n-earlier' })) }),
    })
    await expect(c.exchange('the-code', 'https://verba.example.com/cb', handshake)).rejects.toThrow(/nonce/i)
  })

  it('refuses a discovery document that claims a different issuer', async () => {
    const c = new OidcClient(config, {
      fetchImpl: stubFetch({
        [`${ISSUER}/.well-known/openid-configuration`]: () =>
          json({ ...discoveryDoc, issuer: 'https://evil.example.com' }),
      }),
    })
    await expect(c.authorizeUrl('https://verba.example.com/cb')).rejects.toThrow(/issuer mismatch/i)
  })

  it('surfaces a token endpoint error rather than a bare failure', async () => {
    const c = client({
      [discoveryDoc.token_endpoint]: () =>
        json({ error: 'invalid_grant', error_description: 'code already used' }, 400),
    })
    await expect(
      c.exchange('used', 'https://verba.example.com/cb', { state: 's', nonce: 'n', verifier: 'v' }),
    ).rejects.toThrow(/code already used/)
  })
})

describe('configuration from the environment', () => {
  const saved = { ...process.env }

  beforeEach(() => {
    for (const key of Object.keys(process.env)) {
      if (/^(OIDC_|PLATFORM_|LICENSE_KEY)/.test(key)) delete process.env[key]
    }
  })
  afterEach(() => {
    process.env = { ...saved }
  })

  it('reads an OIDC provider from OIDC_ISSUER and OIDC_CLIENT_ID', () => {
    const config = oidcConfigFromEnv({ OIDC_ISSUER: `${ISSUER}/`, OIDC_CLIENT_ID: 'abc' } as NodeJS.ProcessEnv)
    // The trailing slash is dropped: it is the issuer id_tokens will claim,
    // and a string comparison later would fail on it.
    expect(config?.issuer).toBe(ISSUER)
    expect(config?.scopes).toEqual(['openid', 'email', 'profile'])
    expect(config?.autoProvision).toBe(true)
  })

  it('reports no OIDC provider when only half of it is configured', () => {
    expect(oidcConfigFromEnv({ OIDC_ISSUER: ISSUER } as NodeJS.ProcessEnv)).toBeNull()
    expect(oidcConfigFromEnv({ OIDC_CLIENT_ID: 'abc' } as NodeJS.ProcessEnv)).toBeNull()
  })

  // The regression that broke platform sign-in: an issuer with no app id used
  // to fall back to the slug `verba`, which no platform app carries.
  it('reports no handover provider when the app id is missing', () => {
    expect(handoverConfigFromEnv({ PLATFORM_ISSUER: ISSUER } as NodeJS.ProcessEnv)).toBeNull()
  })

  it('reads a handover provider from both variables', () => {
    const config = handoverConfigFromEnv({
      PLATFORM_ISSUER: ISSUER,
      PLATFORM_APP_ID: 'nubisco-verba',
    } as NodeJS.ProcessEnv)
    expect(config?.appId).toBe('nubisco-verba')
    expect(config?.authorizeUrl).toBe(`${ISSUER}/api/auth/sso`)
    expect(config?.label).toBe('Nubisco Platform')
  })

  it('builds a handover authorize URL carrying the app id, state and login hint', () => {
    const config = handoverConfigFromEnv({
      PLATFORM_ISSUER: ISSUER,
      PLATFORM_APP_ID: 'nubisco-verba',
    } as NodeJS.ProcessEnv)!
    const url = new URL(handoverAuthorizeUrl(config, 'https://verba.example.com/cb', 'st', { loginHint: 'a@b.c' }))
    expect(url.searchParams.get('app_id')).toBe('nubisco-verba')
    expect(url.searchParams.get('redirect_uri')).toBe('https://verba.example.com/cb')
    expect(url.searchParams.get('state')).toBe('st')
    expect(url.searchParams.get('login_hint')).toBe('a@b.c')
  })

  it('honours no provider at all without a licence key', () => {
    process.env.OIDC_ISSUER = ISSUER
    process.env.OIDC_CLIENT_ID = 'abc'
    expect(ssoRuntimeFromEnv(process.env)).toBeNull()
  })

  it('prefers OIDC over handover when a licensed instance configures both', () => {
    process.env.LICENSE_KEY = 'licensed'
    process.env.OIDC_ISSUER = ISSUER
    process.env.OIDC_CLIENT_ID = 'abc'
    process.env.PLATFORM_ISSUER = ISSUER
    process.env.PLATFORM_APP_ID = 'nubisco-verba'
    process.env.PLATFORM_SERVER_FLOW = 'true'
    expect(ssoRuntimeFromEnv(process.env)?.mode).toBe('oidc')
  })

  it('takes the server-side handover flow only once it is asked for', () => {
    process.env.LICENSE_KEY = 'licensed'
    process.env.PLATFORM_ISSUER = ISSUER
    process.env.PLATFORM_APP_ID = 'nubisco-verba'
    // An instance already signing in through the browser-driven flow has both
    // of those set. Moving it here on deploy would point it at a callback URI
    // Platform has not been told about, so it stays where it is until asked.
    expect(ssoRuntimeFromEnv(process.env)).toBeNull()

    process.env.PLATFORM_SERVER_FLOW = 'true'
    expect(ssoRuntimeFromEnv(process.env)?.mode).toBe('handover')
  })
})
