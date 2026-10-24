import nodeCrypto from 'node:crypto'

// Customers' own AI provider keys, encrypted at rest (AGENTS.md, "AI features").
//
// AES-GCM through crypto.subtle, keyed from a deployment secret that exists for
// nothing else: AI_ENCRYPTION_KEY (ENCRYPTION_KEY, the earlier name, is still
// read). With no secret configured, saving a key is refused. A development
// secret is an explicit opt-in, AI_DEV_SECRET=true, never inferred from
// NODE_ENV: inferring it would quietly protect a self-hosted instance's keys
// with a published constant the moment somebody copied a local configuration.
//
// Stored format: `v1:<base64 iv>:<base64 ciphertext+tag>`, the same as Erigo's
// and Analytics'. crypto.subtle appends the GCM tag to the ciphertext.

const ENCRYPTION_VERSION = 'v1'
const IV_BYTES = 12
const DEV_SECRET = 'verba-local-development-only'

export class AiKeyStorageError extends Error {
  statusCode = 503
}

/** The secret new keys are sealed with, or null when this deployment has none. */
export function encryptionSecret(): string | null {
  const configured = process.env.AI_ENCRYPTION_KEY || process.env.ENCRYPTION_KEY
  if (configured) return configured
  if (process.env.AI_DEV_SECRET === 'true') return DEV_SECRET
  return null
}

/** Whether this server can store AI keys at all. */
export function aiEncryptionConfigured(): boolean {
  return encryptionSecret() !== null
}

function requireSecret(): string {
  const secret = encryptionSecret()
  if (!secret) {
    throw new AiKeyStorageError(
      'AI keys cannot be stored: this server has no AI_ENCRYPTION_KEY. Ask the person who runs Verba to set one.',
    )
  }
  return secret
}

function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64')
}

function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  const buffer = Buffer.from(value, 'base64')
  const bytes = new Uint8Array(new ArrayBuffer(buffer.length))
  bytes.set(buffer)
  return bytes
}

async function keyFrom(secret: string, usage: KeyUsage[]): Promise<CryptoKey> {
  // A passphrase run through SHA-256, so the secret can be any long random string.
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret))
  return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, usage)
}

/** Seal a provider key. Refuses, rather than storing it under anything weaker, when there is no secret. */
export async function encrypt(plaintext: string): Promise<string> {
  const key = await keyFrom(requireSecret(), ['encrypt'])
  // A random IV per key: a fixed one would make identical keys recognisable from the ciphertext.
  const iv = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(IV_BYTES)))
  const sealed = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext))
  return `${ENCRYPTION_VERSION}:${toBase64(iv)}:${toBase64(new Uint8Array(sealed))}`
}

/** True for a value in the current format. */
export function isCurrentFormat(value: string): boolean {
  const parts = value.split(':')
  return parts.length === 3 && parts[0] === ENCRYPTION_VERSION
}

/** Open a value in the current format. Throws when the secret is missing or is not the one it was sealed with. */
export async function decrypt(encoded: string): Promise<string> {
  const parts = encoded.split(':')
  if (parts.length !== 3 || parts[0] !== ENCRYPTION_VERSION) throw new Error('Unrecognised stored key')
  const key = await keyFrom(requireSecret(), ['decrypt'])
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(parts[1]) }, key, fromBase64(parts[2]))
  return new TextDecoder().decode(plain)
}

// ─── Keys stored before this format ──────────────────────────────────────────
//
// Until now a key was sealed with node:crypto as `iv:tag:ciphertext`, under
// AI_ENCRYPTION_KEY in 1.13.1, and before that under ENCRYPTION_KEY, else
// JWT_SECRET, else the constant 'dev-secret'. A key
// saved before encryption existed was stored as plain text. Those keys are
// read only to be sealed again in the current format, which happens as soon as
// AI_ENCRYPTION_KEY is configured (ai-settings.service.ts, migrateStoredAiKeys),
// so a project keeps its key through the upgrade without entering it again.
// A legacy key is never used for a request while it is still in the old
// format, and nothing new is ever written under the old secrets.

/** The development constant 1.13.1 sealed with under AI_DEV_SECRET=true. */
const LEGACY_DEV_SECRET = 'verba-development-only-ai-key-secret'

function isLegacyFormat(value: string): boolean {
  const parts = value.split(':')
  return parts.length === 3 && parts[0] !== ENCRYPTION_VERSION && parts.every((p) => /^[A-Za-z0-9+/=]+$/.test(p))
}

function legacyDecrypt(encoded: string, secret: string): string {
  const [ivB64, tagB64, dataB64] = encoded.split(':')
  const key = nodeCrypto.createHash('sha256').update(secret).digest()
  const decipher = nodeCrypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'))
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'))
  return decipher.update(Buffer.from(dataB64, 'base64')).toString('utf8') + decipher.final('utf8')
}

export interface OpenedKey {
  apiKey: string
  /** True when the stored value is not in the current format and should be sealed again. */
  legacy: boolean
}

/**
 * Read a stored key in any format it has ever been written in.
 *
 * Returns null when it cannot be opened (a different secret, a damaged value),
 * which means the key has to be entered again.
 */
export async function openStoredKey(stored: string): Promise<OpenedKey | null> {
  if (isCurrentFormat(stored)) {
    try {
      return { apiKey: await decrypt(stored), legacy: false }
    } catch {
      return null
    }
  }
  if (isLegacyFormat(stored)) {
    // Every secret an earlier release sealed with: 1.13.1 used AI_ENCRYPTION_KEY
    // (or its own development constant), earlier ones ENCRYPTION_KEY, else
    // JWT_SECRET, else 'dev-secret'.
    const candidates = [
      process.env.AI_ENCRYPTION_KEY,
      process.env.ENCRYPTION_KEY,
      process.env.AI_DEV_SECRET === 'true' ? LEGACY_DEV_SECRET : undefined,
      process.env.JWT_SECRET,
      'dev-secret',
    ].filter((s): s is string => Boolean(s))
    for (const secret of candidates) {
      try {
        return { apiKey: legacyDecrypt(stored, secret), legacy: true }
      } catch {
        // Not this secret. Try the next one the old code would have used.
      }
    }
    return null
  }
  // Saved before keys were encrypted at all.
  return stored.trim() ? { apiKey: stored.trim(), legacy: true } : null
}
