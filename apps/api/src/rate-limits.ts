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
// In memory on Node, which is right for the single API process the Docker
// image runs. A Cloudflare Worker runs as many instances, so there each check
// is Cloudflare's rate limiting binding instead, which only counts per 10 or 60
// seconds: WORKER_RATE_LIMITS below has its per-minute numbers (decided by
// Jose, 2026-11-03), and wrangler.toml must match them.

const WINDOW_MS = 15 * 60 * 1000

export const AUTH_LIMITS = {
  otpRequest: { perIp: 20, perEmail: 5 },
  otpVerify: { perIp: 30, perEmail: 15 },
  passwordLogin: { perIp: 20, perEmail: 10 },
  federatedCallback: { perIp: 30 },
} as const

/** The checks, one counter each. */
export type RateCheck =
  | 'otp-request:ip'
  | 'otp-request:email'
  | 'otp-verify:ip'
  | 'otp-verify:email'
  | 'login:ip'
  | 'login:email'
  | 'federated:ip'

/**
 * The same checks on a Worker, per minute, each its own `[[ratelimits]]`
 * binding. They allow more over 15 minutes than AUTH_LIMITS. What stops a
 * one-time code being guessed is the per-code attempt cap in otp.service.ts,
 * which is in the database and the same everywhere. Verba's namespace ids are
 * the 12xx range (Acta uses 11xx, Accord 10xx).
 */
export const WORKER_RATE_LIMITS: Record<RateCheck, { binding: string; namespaceId: string; limit: number }> = {
  'otp-request:ip': { binding: 'VERBA_OTP_REQUEST_IP_LIMITER', namespaceId: '1201', limit: 5 },
  'otp-request:email': { binding: 'VERBA_OTP_REQUEST_EMAIL_LIMITER', namespaceId: '1202', limit: 2 },
  'otp-verify:ip': { binding: 'VERBA_OTP_VERIFY_IP_LIMITER', namespaceId: '1203', limit: 10 },
  'otp-verify:email': { binding: 'VERBA_OTP_VERIFY_EMAIL_LIMITER', namespaceId: '1204', limit: 5 },
  'login:ip': { binding: 'VERBA_LOGIN_IP_LIMITER', namespaceId: '1205', limit: 5 },
  'login:email': { binding: 'VERBA_LOGIN_EMAIL_LIMITER', namespaceId: '1206', limit: 3 },
  'federated:ip': { binding: 'VERBA_FEDERATED_IP_LIMITER', namespaceId: '1207', limit: 10 },
}

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
  name: RateCheck
  limiter: RateLimiter
  key: (c: Ctx) => string | Promise<string>
}

/** Where a check's counter lives, when it is not this process (a Worker's bindings). */
export type RateLimiterSource = (check: RateCheck) => RateLimiter | undefined

/** What a Cloudflare rate limiting binding exposes. */
export interface RateLimitBinding {
  limit(options: { key: string }): Promise<{ success: boolean }>
}

/**
 * The Worker's limiters, from its `[[ratelimits]]` bindings by name. A check
 * whose binding is missing falls back to this isolate's own counter, which is
 * a weaker limit and better than none.
 */
export function bindingRateLimiters(env: Record<string, unknown>): RateLimiterSource {
  return (check) => {
    const binding = env[WORKER_RATE_LIMITS[check].binding] as RateLimitBinding | undefined
    if (!binding || typeof binding.limit !== 'function') return undefined
    return {
      // The binding says only yes or no, so a refusal asks for the whole minute.
      limit: async (key) => ({ success: (await binding.limit({ key })).success, retryAfterSeconds: 60 }),
    }
  }
}

/** One middleware that applies several limits, each counted on every request. */
function limits(...checks: Check[]): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    for (const { name, limiter, key } of checks) {
      const result = await limiter.limit(`${name}:${await key(c)}`)
      if (!result.success) {
        c.header('retry-after', String(result.retryAfterSeconds))
        return c.json({ error: 'Too many attempts. Wait a few minutes and try again.' }, 429)
      }
    }
    await next()
  }
}

/**
 * The sign-in limits, with their own counters (one set per app): in this
 * process with AUTH_LIMITS, or wherever `source` keeps them.
 */
export function authRateLimits(source: RateLimiterSource = () => undefined) {
  const check = (name: RateCheck, max: number, key: (c: Ctx) => string | Promise<string>): Check => ({
    name,
    limiter: source(name) ?? new MemoryRateLimiter(max),
    key,
  })
  return {
    otpRequest: limits(
      check('otp-request:ip', AUTH_LIMITS.otpRequest.perIp, clientIp),
      check('otp-request:email', AUTH_LIMITS.otpRequest.perEmail, emailOf),
    ),
    otpVerify: limits(
      check('otp-verify:ip', AUTH_LIMITS.otpVerify.perIp, clientIp),
      check('otp-verify:email', AUTH_LIMITS.otpVerify.perEmail, emailOf),
    ),
    passwordLogin: limits(
      check('login:ip', AUTH_LIMITS.passwordLogin.perIp, clientIp),
      check('login:email', AUTH_LIMITS.passwordLogin.perEmail, emailOf),
    ),
    federatedCallback: limits(check('federated:ip', AUTH_LIMITS.federatedCallback.perIp, clientIp)),
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
