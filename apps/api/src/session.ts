import type { MiddlewareHandler } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { sign, verify } from 'hono/jwt'
import type { AppEnv, Ctx, SessionUser } from './http.js'
import { prisma } from './prisma.js'
import { syncOperatorFlag } from './services/operator.service.js'

// The session is a signed JWT (HS256) in an httpOnly cookie named `token`.
//
// It used to be signed with no expiry and set without `secure` or
// `sameSite`, so a session lived for ever and travelled over plain HTTP. Now
// it expires, and an active one is quietly renewed: once a token is older
// than SESSION_REFRESH_AFTER_SECONDS, the next authenticated request checks
// the account is still active and swaps in a fresh token. Someone who keeps
// using Verba stays signed in. A token nobody uses dies at SESSION_TTL, and a
// deactivated account loses its session at the next renewal at the latest.
//
// The tokens are the same as the ones @fastify/jwt issued (HS256, the same
// claims, signed with JWT_SECRET), so moving the API to Hono signed nobody out.

export const SESSION_COOKIE = 'token'

/** Browsers cap a cookie's lifetime at 400 days, and Hono refuses a longer one. */
const MAX_COOKIE_AGE_SECONDS = 400 * 24 * 3600

function hours(name: string, fallback: number): number {
  const value = Number(process.env[name])
  return Number.isFinite(value) && value > 0 ? value : fallback
}

/** How long a session lasts without use. SESSION_TTL_HOURS, default 7 days. */
export function sessionTtlSeconds(): number {
  return Math.round(hours('SESSION_TTL_HOURS', 24 * 7) * 3600)
}

/** Age at which an active session is renewed: a day, or half the TTL if that is shorter. */
export function sessionRefreshAfterSeconds(): number {
  return Math.min(24 * 3600, Math.floor(sessionTtlSeconds() / 2))
}

function jwtSecret(): string {
  return process.env.JWT_SECRET || 'dev-secret'
}

/**
 * Attributes for every cookie that carries or clears a credential.
 * `secure` in production unless COOKIE_SECURE=false (an instance served over
 * plain HTTP on a private network). `lax` so a link into Verba from elsewhere
 * still arrives signed in, while a cross-site POST does not carry the cookie.
 */
export function credentialCookieOptions() {
  const secure =
    process.env.COOKIE_SECURE === 'true' ||
    (process.env.NODE_ENV === 'production' && process.env.COOKIE_SECURE !== 'false')
  return { httpOnly: true, path: '/', sameSite: 'Lax' as const, secure }
}

/** A cookie lifetime Hono accepts. */
export function cookieMaxAge(seconds: number): number {
  return Math.min(seconds, MAX_COOKIE_AGE_SECONDS)
}

export interface SessionClaims {
  userId: string
  email: string
  plan?: string
  platformSub?: string
}

/** Sign session claims. `ttlSeconds` false signs a token with no expiry (tests of legacy tokens only). */
export async function signSession(claims: SessionClaims, ttlSeconds: number | false = sessionTtlSeconds()) {
  const payload: Record<string, unknown> = { userId: claims.userId, email: claims.email }
  if (claims.plan !== undefined) payload.plan = claims.plan
  if (claims.platformSub !== undefined) payload.platformSub = claims.platformSub
  const iat = Math.floor(Date.now() / 1000)
  payload.iat = iat
  if (ttlSeconds !== false) payload.exp = iat + ttlSeconds
  return sign(payload, jwtSecret(), 'HS256')
}

/**
 * Verify a session token: signature, expiry, and a maximum age that also
 * retires tokens signed before sessions expired. Null when it fails any.
 */
export async function verifySession(token: string): Promise<SessionUser | null> {
  try {
    const payload = (await verify(token, jwtSecret(), 'HS256')) as unknown as SessionUser
    if (typeof payload.iat !== 'number') return null
    if (Math.floor(Date.now() / 1000) - payload.iat > sessionTtlSeconds()) return null
    if (typeof payload.userId !== 'string' || typeof payload.email !== 'string') return null
    return payload
  } catch {
    return null
  }
}

/** Sign a session and set it on the response. The one way a session is created. */
export async function issueSession(c: Ctx, claims: SessionClaims): Promise<string> {
  const ttl = sessionTtlSeconds()
  const token = await signSession(claims, ttl)
  setCookie(c, SESSION_COOKIE, token, { ...credentialCookieOptions(), maxAge: cookieMaxAge(ttl) })
  return token
}

/**
 * A sign-in: bring the operator flag in line with VERBA_OPERATORS (recording
 * any change), then issue the session. Every sign-in route uses this.
 */
export async function startSession(c: Ctx, claims: SessionClaims): Promise<void> {
  await syncOperatorFlag(claims.userId)
  await issueSession(c, claims)
}

/** Clear a cookie with Max-Age=0 and an Expires in the past, as @fastify/cookie did. */
export function clearCookie(c: Ctx, name: string, options: Parameters<typeof deleteCookie>[2] = { path: '/' }): void {
  deleteCookie(c, name, { ...options, expires: new Date(0) })
}

export function clearSession(c: Ctx): void {
  clearCookie(c, SESSION_COOKIE, credentialCookieOptions())
}

/**
 * The `authenticate` middleware: verify the session, then renew it if it is
 * getting old. Sets `c.var.user`.
 */
export const authenticate: MiddlewareHandler<AppEnv> = async (c, next) => {
  const token = getCookie(c, SESSION_COOKIE)
  const user = token ? await verifySession(token) : null
  if (!user) return c.json({ error: 'Unauthorized' }, 401)
  c.set('user', user)

  const age = Math.floor(Date.now() / 1000) - (user.iat ?? 0)
  if (age >= sessionRefreshAfterSeconds()) {
    const account = await prisma.user.findUnique({
      where: { id: user.userId },
      select: { deactivatedAt: true },
    })
    if (!account || account.deactivatedAt != null) {
      clearSession(c)
      return c.json({ error: 'Unauthorized' }, 401)
    }
    await issueSession(c, user)
  }
  await next()
}
