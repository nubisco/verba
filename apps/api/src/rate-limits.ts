import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'

// Limits on the doors a stranger can knock on without an account.
//
// Two keys per route, because each one alone has a hole. Per IP stops one
// machine hammering many addresses (email bombing through our Resend account).
// Per email stops many machines hammering one address (guessing its code from
// a botnet). The per-code attempt cap in otp.service.ts sits underneath both.
//
// In memory, which is right for the single API process Verba runs as. A
// second process would need a shared store.

const WINDOW = '15 minutes'

export const AUTH_LIMITS = {
  otpRequest: { perIp: 20, perEmail: 5 },
  otpVerify: { perIp: 30, perEmail: 15 },
  passwordLogin: { perIp: 20, perEmail: 10 },
  federatedCallback: { perIp: 30 },
} as const

function emailOf(req: FastifyRequest): string {
  const email = (req.body as { email?: unknown } | undefined)?.email
  return typeof email === 'string' ? email.toLowerCase().trim() : '(none)'
}

type Check = (req: FastifyRequest) => ReturnType<ReturnType<FastifyInstance['createRateLimit']>>

function check(app: FastifyInstance, name: string, max: number, key: (req: FastifyRequest) => string): Check {
  return app.createRateLimit({ max, timeWindow: WINDOW, keyGenerator: (req) => `${name}:${key(req)}` })
}

/**
 * One preHandler that applies several limits. The plugin's own `rateLimit()`
 * handler runs at most once per request, so two of them on one route would
 * silently enforce only the first.
 */
function limits(...checks: Check[]) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    for (const run of checks) {
      const result = await run(req)
      if (!result.isAllowed && result.isExceeded) {
        void reply.header('retry-after', String(result.ttlInSeconds))
        return reply.status(429).send({ error: 'Too many attempts. Wait a few minutes and try again.' })
      }
    }
  }
}

export function authRateLimits(app: FastifyInstance) {
  return {
    otpRequest: limits(
      check(app, 'otp-request:ip', AUTH_LIMITS.otpRequest.perIp, (req) => req.ip),
      check(app, 'otp-request:email', AUTH_LIMITS.otpRequest.perEmail, emailOf),
    ),
    otpVerify: limits(
      check(app, 'otp-verify:ip', AUTH_LIMITS.otpVerify.perIp, (req) => req.ip),
      check(app, 'otp-verify:email', AUTH_LIMITS.otpVerify.perEmail, emailOf),
    ),
    passwordLogin: limits(
      check(app, 'login:ip', AUTH_LIMITS.passwordLogin.perIp, (req) => req.ip),
      check(app, 'login:email', AUTH_LIMITS.passwordLogin.perEmail, emailOf),
    ),
    federatedCallback: limits(check(app, 'federated:ip', AUTH_LIMITS.federatedCallback.perIp, (req) => req.ip)),
  }
}

/**
 * Which proxies may tell us the client's address.
 *
 * The bundled nginx, and whatever sits in front of it on the host (a Synology
 * reverse proxy, a tunnel), reach the API from private addresses. Trusting
 * those, and only those, makes `req.ip` the first public address in
 * X-Forwarded-For counted from the right, which a client cannot forge by
 * sending its own header. TRUST_PROXY overrides it: `false`, `true`, or a
 * comma-separated list of addresses, CIDR ranges or the proxy-addr names
 * (loopback, linklocal, uniquelocal).
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
