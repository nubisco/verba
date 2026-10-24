import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { prisma } from './prisma.js'
import { syncOperatorFlag } from './services/operator.service.js'

// The session is a signed JWT in an httpOnly cookie named `token`.
//
// It used to be signed with no expiry and set without `secure` or
// `sameSite`, so a session lived for ever and travelled over plain HTTP. Now
// it expires, and an active one is quietly renewed: once a token is older
// than SESSION_REFRESH_AFTER_SECONDS, the next authenticated request checks
// the account is still active and swaps in a fresh token. Someone who keeps
// using Verba stays signed in. A token nobody uses dies at SESSION_TTL, and a
// deactivated account loses its session at the next renewal at the latest.

export const SESSION_COOKIE = 'token'

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
  return { httpOnly: true, path: '/', sameSite: 'lax' as const, secure }
}

export interface SessionClaims {
  userId: string
  email: string
  plan?: string
  platformSub?: string
}

/** Sign a session and set it on the reply. The one way a session is created. */
export function issueSession(app: FastifyInstance, reply: FastifyReply, claims: SessionClaims): string {
  const payload: SessionClaims = { userId: claims.userId, email: claims.email }
  if (claims.plan !== undefined) payload.plan = claims.plan
  if (claims.platformSub !== undefined) payload.platformSub = claims.platformSub
  const ttl = sessionTtlSeconds()
  const token = app.jwt.sign(payload, { expiresIn: ttl })
  reply.setCookie(SESSION_COOKIE, token, { ...credentialCookieOptions(), maxAge: ttl })
  return token
}

/**
 * A sign-in: bring the operator flag in line with VERBA_OPERATORS (recording
 * any change), then issue the session. Every sign-in route uses this.
 */
export async function startSession(app: FastifyInstance, reply: FastifyReply, claims: SessionClaims): Promise<void> {
  await syncOperatorFlag(claims.userId)
  issueSession(app, reply, claims)
}

export function clearSession(reply: FastifyReply): void {
  reply.clearCookie(SESSION_COOKIE, credentialCookieOptions())
}

/**
 * The `authenticate` preHandler: verify the session (signature, expiry, and a
 * maximum age that also retires tokens issued before sessions expired), then
 * renew it if it is getting old.
 */
export function makeAuthenticate(app: FastifyInstance) {
  return async function authenticate(request: FastifyRequest, reply: FastifyReply) {
    try {
      await request.jwtVerify()
    } catch {
      return reply.status(401).send({ error: 'Unauthorized' })
    }

    const issuedAt = (request.user as { iat?: number }).iat ?? 0
    const age = Math.floor(Date.now() / 1000) - issuedAt
    if (age < sessionRefreshAfterSeconds()) return

    const account = await prisma.user.findUnique({
      where: { id: request.user.userId },
      select: { deactivatedAt: true },
    })
    if (!account || account.deactivatedAt != null) {
      clearSession(reply)
      return reply.status(401).send({ error: 'Unauthorized' })
    }
    issueSession(app, reply, request.user)
  }
}
