import type { MiddlewareHandler } from 'hono'
import proxyaddr from 'proxy-addr'
import type { AppEnv, Ctx } from './http.js'
import { readBody } from './http.js'

// Limits on the doors a stranger can knock on without an account.
//
// Two keys per route, because each one alone has a hole. Per IP stops one
// machine hammering many addresses (email bombing through our Resend account).
// Per email stops many machines hammering one address (guessing its code from
// a botnet). The per-code attempt cap in otp.service.ts sits underneath both.
//
// In memory, which is right for the single API process Verba runs as. A
// second process would need a shared store, and so does a Cloudflare Worker
// (docs/hosting-on-cloudflare.md).

const WINDOW_MS = 15 * 60 * 1000

export const AUTH_LIMITS = {
  otpRequest: { perIp: 20, perEmail: 5 },
  otpVerify: { perIp: 30, perEmail: 15 },
  passwordLogin: { perIp: 20, perEmail: 10 },
  federatedCallback: { perIp: 30 },
} as const

/** Whether one more call fits, and if not, how long until it does. */
export interface RateLimiter {
  limit(key: string): Promise<{ success: boolean; retryAfterSeconds: number }>
}

/**
 * A fixed window per key, in memory, as @fastify/rate-limit counted it.
 * Expired windows are swept when the map grows, so a stream of distinct keys
 * (one per address) cannot grow it without bound.
 */
export class MemoryRateLimiter implements RateLimiter {
  private readonly windows = new Map<string, { start: number; count: number }>()

  constructor(
    private readonly max: number,
    private readonly windowMs: number = WINDOW_MS,
    private readonly clock: () => number = Date.now,
  ) {}

  async limit(key: string): Promise<{ success: boolean; retryAfterSeconds: number }> {
    const now = this.clock()
    let window = this.windows.get(key)
    if (!window || now - window.start >= this.windowMs) {
      window = { start: now, count: 0 }
      this.windows.set(key, window)
    }
    window.count += 1
    if (this.windows.size > 10_000) this.sweep(now)
    const retryAfterSeconds = Math.ceil((window.start + this.windowMs - now) / 1000)
    return { success: window.count <= this.max, retryAfterSeconds }
  }

  private sweep(now: number): void {
    for (const [key, window] of this.windows) {
      if (now - window.start >= this.windowMs) this.windows.delete(key)
    }
  }
}

async function emailOf(c: Ctx): Promise<string> {
  let body: unknown
  try {
    body = await readBody(c)
  } catch {
    // A malformed body is the route's 400 to give, not the limiter's.
    return '(none)'
  }
  const email = (body as { email?: unknown } | undefined)?.email
  return typeof email === 'string' ? email.toLowerCase().trim() : '(none)'
}

interface Check {
  limiter: RateLimiter
  key: (c: Ctx) => string | Promise<string>
}

function check(max: number, key: (c: Ctx) => string | Promise<string>): Check {
  return { limiter: new MemoryRateLimiter(max), key }
}

/** One middleware that applies several limits, each counted on every request. */
function limits(...checks: Check[]): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    for (const { limiter, key } of checks) {
      const result = await limiter.limit(await key(c))
      if (!result.success) {
        c.header('retry-after', String(result.retryAfterSeconds))
        return c.json({ error: 'Too many attempts. Wait a few minutes and try again.' }, 429)
      }
    }
    await next()
  }
}

/** The sign-in limits, with their own counters (one set per app). */
export function authRateLimits() {
  return {
    otpRequest: limits(check(AUTH_LIMITS.otpRequest.perIp, clientIp), check(AUTH_LIMITS.otpRequest.perEmail, emailOf)),
    otpVerify: limits(check(AUTH_LIMITS.otpVerify.perIp, clientIp), check(AUTH_LIMITS.otpVerify.perEmail, emailOf)),
    passwordLogin: limits(
      check(AUTH_LIMITS.passwordLogin.perIp, clientIp),
      check(AUTH_LIMITS.passwordLogin.perEmail, emailOf),
    ),
    federatedCallback: limits(check(AUTH_LIMITS.federatedCallback.perIp, clientIp)),
  }
}

/**
 * Which proxies may tell us the client's address.
 *
 * The bundled nginx, and whatever sits in front of it on the host (a Synology
 * reverse proxy, a tunnel), reach the API from private addresses. Trusting
 * those, and only those, makes the client address the first public address in
 * X-Forwarded-For counted from the right, which a client cannot forge by
 * sending its own header. TRUST_PROXY overrides it: `false`, `true`, or a
 * comma-separated list of addresses, CIDR ranges or the proxy-addr names
 * (loopback, linklocal, uniquelocal). Read by clientIp below.
 */
export function trustProxySetting(value: string | undefined = process.env.TRUST_PROXY): boolean | string[] {
  const raw = value?.trim() ? value : 'loopback,linklocal,uniquelocal'
  if (raw === 'true') return true
  if (raw === 'false') return false
  return raw
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
}

let trustCache: { raw: string | undefined; trust: ReturnType<typeof proxyaddr.compile> | boolean } | null = null

function trustFunction(): ReturnType<typeof proxyaddr.compile> | boolean {
  const raw = process.env.TRUST_PROXY
  if (!trustCache || trustCache.raw !== raw) {
    const setting = trustProxySetting(raw)
    trustCache = { raw, trust: typeof setting === 'boolean' ? setting : proxyaddr.compile(setting) }
  }
  return trustCache.trust
}

/**
 * The caller's address, for rate limits.
 *
 * On Node it is the socket's address, or the first address in
 * X-Forwarded-For that a trusted proxy did not add (TRUST_PROXY, see
 * above), which is what Fastify's `req.ip` was. Without a Node
 * request it is `cf-connecting-ip`, which only Cloudflare can set.
 */
export function clientIp(c: Ctx): string {
  const incoming = c.env?.incoming
  if (!incoming) return c.req.header('cf-connecting-ip') ?? 'unknown'
  const trust = trustFunction()
  if (trust === false) return incoming.socket?.remoteAddress ?? 'unknown'
  if (trust === true) return proxyaddr(incoming, () => true)
  return proxyaddr(incoming, trust)
}
