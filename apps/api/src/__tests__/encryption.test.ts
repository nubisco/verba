import nodeCrypto from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  aiEncryptionConfigured,
  AiKeyStorageError,
  decrypt,
  encrypt,
  isCurrentFormat,
  openStoredKey,
} from '../services/encryption.service.js'

const KEY = 'sk-ant-api03-a-real-looking-key'

/** A key as the previous node:crypto code stored it, under a given secret. */
function legacySeal(plaintext: string, secret: string): string {
  const key = nodeCrypto.createHash('sha256').update(secret).digest()
  const iv = nodeCrypto.randomBytes(12)
  const cipher = nodeCrypto.createCipheriv('aes-256-gcm', key, iv)
  const data = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  return `${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${data.toString('base64')}`
}

beforeEach(() => {
  vi.stubEnv('AI_ENCRYPTION_KEY', '')
  vi.stubEnv('ENCRYPTION_KEY', '')
  vi.stubEnv('AI_DEV_SECRET', '')
  vi.stubEnv('JWT_SECRET', '')
  vi.stubEnv('NODE_ENV', 'development')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('sealing a key', () => {
  it('round-trips under AI_ENCRYPTION_KEY, in the v1 format, with a fresh IV each time', async () => {
    vi.stubEnv('AI_ENCRYPTION_KEY', 'a-long-random-deployment-secret')
    const a = await encrypt(KEY)
    const b = await encrypt(KEY)
    expect(isCurrentFormat(a)).toBe(true)
    expect(a).not.toContain(KEY)
    expect(a).not.toBe(b)
    expect(await decrypt(a)).toBe(KEY)
  })

  it('refuses without a secret, even in development: there is no fallback to JWT_SECRET or a constant', async () => {
    vi.stubEnv('JWT_SECRET', 'the-session-secret')
    expect(aiEncryptionConfigured()).toBe(false)
    await expect(encrypt(KEY)).rejects.toBeInstanceOf(AiKeyStorageError)
  })

  it('uses the development secret only when AI_DEV_SECRET=true says so', async () => {
    vi.stubEnv('AI_DEV_SECRET', 'true')
    expect(aiEncryptionConfigured()).toBe(true)
    expect(await decrypt(await encrypt(KEY))).toBe(KEY)
  })

  it('still reads the earlier ENCRYPTION_KEY name', async () => {
    vi.stubEnv('ENCRYPTION_KEY', 'the-earlier-name')
    expect(await decrypt(await encrypt(KEY))).toBe(KEY)
  })

  it('cannot open a key sealed under a different secret', async () => {
    vi.stubEnv('AI_ENCRYPTION_KEY', 'first-secret')
    const sealed = await encrypt(KEY)
    vi.stubEnv('AI_ENCRYPTION_KEY', 'second-secret')
    expect(await openStoredKey(sealed)).toBeNull()
  })
})

describe('reading keys stored before this format', () => {
  it('opens a key the old code sealed under JWT_SECRET, as production did, and marks it legacy', async () => {
    vi.stubEnv('JWT_SECRET', 'production-jwt-secret')
    expect(await openStoredKey(legacySeal(KEY, 'production-jwt-secret'))).toEqual({ apiKey: KEY, legacy: true })
  })

  it('opens one sealed under the old constant or ENCRYPTION_KEY', async () => {
    expect(await openStoredKey(legacySeal(KEY, 'dev-secret'))).toEqual({ apiKey: KEY, legacy: true })
    vi.stubEnv('ENCRYPTION_KEY', 'old-encryption-key')
    expect(await openStoredKey(legacySeal(KEY, 'old-encryption-key'))).toEqual({ apiKey: KEY, legacy: true })
  })

  it('opens a key 1.13.1 sealed in the old format under AI_ENCRYPTION_KEY', async () => {
    vi.stubEnv('AI_ENCRYPTION_KEY', 'the-deployment-secret')
    expect(await openStoredKey(legacySeal(KEY, 'the-deployment-secret'))).toEqual({ apiKey: KEY, legacy: true })
  })

  it('opens a plain-text key saved before keys were encrypted, and marks it legacy', async () => {
    expect(await openStoredKey(KEY)).toEqual({ apiKey: KEY, legacy: true })
  })

  it('reports a current-format key as not legacy', async () => {
    vi.stubEnv('AI_ENCRYPTION_KEY', 'a-long-random-deployment-secret')
    expect(await openStoredKey(await encrypt(KEY))).toEqual({ apiKey: KEY, legacy: false })
  })
})
