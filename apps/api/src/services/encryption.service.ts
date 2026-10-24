import crypto from 'node:crypto'

// Customer AI provider keys are encrypted at rest with AES-256-GCM, keyed from
// a secret that exists for nothing else.
//
// AI_ENCRYPTION_KEY (ENCRYPTION_KEY, the earlier name, is still read). With no
// secret configured, saving a key is refused. The fallback to JWT_SECRET and
// then to the constant 'dev-secret' is gone: the first tied two secrets
// together, the second protected every self-hosted instance's keys with a
// published string. A development secret is an explicit opt-in,
// AI_DEV_SECRET=true, and never inferred from NODE_ENV.

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12 // GCM standard
const DEV_SECRET = 'verba-development-only-ai-key-secret'

function notConfigured(): never {
  throw Object.assign(
    new Error(
      'AI keys cannot be stored: the server has no AI_ENCRYPTION_KEY. Ask the person who runs Verba to set one.',
    ),
    { statusCode: 422 },
  )
}

function secret(): string | null {
  const configured = process.env.AI_ENCRYPTION_KEY || process.env.ENCRYPTION_KEY
  if (configured) return configured
  if (process.env.AI_DEV_SECRET === 'true') return DEV_SECRET
  return null
}

/** Whether this server can store and read AI keys at all. */
export function aiEncryptionConfigured(): boolean {
  return secret() !== null
}

function getKey(): Buffer {
  const value = secret()
  if (!value) notConfigured()
  // Derive a 32-byte key via SHA-256
  return crypto.createHash('sha256').update(value).digest()
}

export function encrypt(plaintext: string): string {
  const key = getKey()
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  // Format: base64(iv):base64(tag):base64(ciphertext)
  return `${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`
}

export function decrypt(encoded: string): string {
  const parts = encoded.split(':')
  if (parts.length !== 3) throw new Error('Invalid encrypted value format')
  const [ivB64, tagB64, dataB64] = parts
  const key = getKey()
  const iv = Buffer.from(ivB64, 'base64')
  const tag = Buffer.from(tagB64, 'base64')
  const data = Buffer.from(dataB64, 'base64')
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)
  return decipher.update(data).toString('utf8') + decipher.final('utf8')
}

/** Returns true if the string looks like an encrypted value (not raw) */
export function isEncrypted(value: string): boolean {
  const parts = value.split(':')
  return parts.length === 3 && parts.every((p) => /^[A-Za-z0-9+/=]+$/.test(p))
}
