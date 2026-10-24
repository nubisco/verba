import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSign, generateKeyPairSync } from 'node:crypto'

vi.mock('../prisma.js', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
    },
  },
}))

import { prisma } from '../prisma.js'
import { tokenNamesApp, verifyPlatformToken } from '../services/platform-auth.service.js'

// A real key pair, so the signature check itself runs.
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const KID = 'k1'
const ISSUER = 'https://platform.example.com'

function sign(claims: Record<string, unknown>): string {
  const b64 = (v: string) => Buffer.from(v).toString('base64url')
  const input = `${b64(JSON.stringify({ alg: 'RS256', kid: KID }))}.${b64(JSON.stringify(claims))}`
  const signer = createSign('RSA-SHA256')
  signer.update(input)
  return `${input}.${signer.sign(privateKey).toString('base64url')}`
}

function claims(overrides: Record<string, unknown> = {}) {
  const now = Math.floor(Date.now() / 1000)
  return { sub: 'p-1', email: 'alice@example.com', role: 'member', iss: ISSUER, exp: now + 300, ...overrides }
}

describe('verifyPlatformToken audience', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('PLATFORM_ISSUER', ISSUER)
    vi.stubEnv('PLATFORM_APP_ID', 'nubisco-verba')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ keys: [{ ...publicKey.export({ format: 'jwk' }), kid: KID }] })),
    )
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'u1',
      email: 'alice@example.com',
      name: 'Alice',
      deactivatedAt: null,
    } as never)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('accepts a token minted for this app', async () => {
    const result = await verifyPlatformToken(sign(claims({ app: 'nubisco-verba', app_plan: 'pro' })))
    expect(result).toMatchObject({ userId: 'u1', plan: 'pro' })
  })

  it('refuses a token minted for another Nubisco app, and does not honour its plan', async () => {
    const result = await verifyPlatformToken(sign(claims({ app: 'nubisco-acta', app_plan: 'enterprise' })))
    expect(result).toBeNull()
    expect(prisma.user.findUnique).not.toHaveBeenCalled()
  })

  it('refuses a token that names no app at all', async () => {
    expect(await verifyPlatformToken(sign(claims()))).toBeNull()
  })

  it('refuses every token when PLATFORM_APP_ID is not configured', async () => {
    vi.stubEnv('PLATFORM_APP_ID', '')
    expect(await verifyPlatformToken(sign(claims({ app: 'nubisco-verba' })))).toBeNull()
  })
})

describe('tokenNamesApp', () => {
  it('matches the app slug or the audience, as a string or a list', () => {
    expect(tokenNamesApp({ app: 'verba' }, 'verba')).toBe(true)
    expect(tokenNamesApp({ aud: 'verba' }, 'verba')).toBe(true)
    expect(tokenNamesApp({ aud: ['x', 'verba'] }, 'verba')).toBe(true)
    expect(tokenNamesApp({ app: 'acta', aud: 'acta' }, 'verba')).toBe(false)
    expect(tokenNamesApp({ app: 'verba' }, undefined)).toBe(false)
  })
})
