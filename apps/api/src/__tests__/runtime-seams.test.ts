import { afterEach, describe, expect, it, vi } from 'vitest'

// The seams that let one API run on Node and on a Cloudflare Worker
// (docs/hosting-on-cloudflare.md): the entry point chooses the database
// client, who keeps work alive after the response, who delivers live updates
// and where the sign-in limits count. Each is tested here with a stand-in for
// the Worker's side.

vi.mock('../ws/index.js', () => ({ wsManager: { broadcast: vi.fn(), notifyUser: vi.fn() } }))

import { defer, setDeferrer } from '../defer.js'
import { live, setLive, type LiveDelivery } from '../live.js'
import { prisma, setPrisma } from '../prisma.js'
import { WORKER_RATE_LIMITS, authRateLimits, bindingRateLimiters, type RateCheck } from '../rate-limits.js'
import { wsManager } from '../ws/index.js'
import { buildApp } from '../app.js'
import { inject } from './inject.js'

describe('the database client', () => {
  it('says so when it is used before the entry point set it', () => {
    expect(() => prisma.user).toThrow(/not set up yet \(prisma\.user\)/)
  })

  it('is whatever the entry point set', () => {
    const client = { user: { count: vi.fn() } }
    setPrisma(client as never)
    expect(prisma.user).toBe(client.user)
  })
})

describe('defer', () => {
  afterEach(() => setDeferrer(() => {}))

  it('hands the work to whoever keeps it alive', async () => {
    const kept: Promise<unknown>[] = []
    setDeferrer((work) => kept.push(work))
    defer(Promise.resolve('done'))
    expect(kept).toHaveLength(1)
    await expect(kept[0]).resolves.toBe('done')
  })

  it('logs a failure and never rejects', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const kept: Promise<unknown>[] = []
    setDeferrer((work) => kept.push(work))
    defer(Promise.reject(new Error('boom')), 'a test')
    await expect(kept[0]).resolves.toBeUndefined()
    expect(warn).toHaveBeenCalledWith('[defer] a test failed:', 'boom')
    warn.mockRestore()
  })
})

describe('live delivery', () => {
  const original = live()
  afterEach(() => setLive(original))

  it('sends to the sockets in this process by default', () => {
    live().broadcast('p1', { type: 'x' })
    live().notifyUser('u1', 'p1', { type: 'y' })
    expect(wsManager.broadcast).toHaveBeenCalledWith('p1', { type: 'x' })
    expect(wsManager.notifyUser).toHaveBeenCalledWith('u1', { type: 'y' })
  })

  it('goes wherever the entry point says', () => {
    const other: LiveDelivery = { broadcast: vi.fn(), notifyUser: vi.fn() }
    setLive(other)
    live().notifyUser('u1', 'p1', { type: 'y' })
    expect(other.notifyUser).toHaveBeenCalledWith('u1', 'p1', { type: 'y' })
  })
})

describe('sign-in limits on a Worker', () => {
  it('has the per-minute numbers Jose decided, each on its own binding in the 12xx range', () => {
    expect(Object.fromEntries(Object.entries(WORKER_RATE_LIMITS).map(([k, v]) => [k, v.limit]))).toEqual({
      'otp-request:ip': 5,
      'otp-request:email': 2,
      'otp-verify:ip': 10,
      'otp-verify:email': 5,
      'login:ip': 5,
      'login:email': 3,
      'federated:ip': 10,
    })
    const ids = Object.values(WORKER_RATE_LIMITS).map((v) => v.namespaceId)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.every((id) => /^12\d\d$/.test(id))).toBe(true)
  })

  it('counts in the bindings, keyed by check, and answers 429 when one refuses', async () => {
    vi.stubEnv('JWT_SECRET', 'test-secret')
    const seen: string[] = []
    const env: Record<string, unknown> = {}
    for (const [check, { binding }] of Object.entries(WORKER_RATE_LIMITS)) {
      env[binding] = {
        limit: async ({ key }: { key: string }) => {
          seen.push(key)
          // The per-email check for one-time codes refuses everything.
          return { success: (check as RateCheck) !== 'otp-request:email' }
        },
      }
    }
    const app = await buildApp({ rateLimiters: bindingRateLimiters(env) })
    const res = await inject(app, {
      method: 'POST',
      url: '/auth/otp/request',
      payload: { email: 'Someone@Example.com' },
      remoteAddress: '203.0.113.5',
    })
    expect(res.statusCode).toBe(429)
    expect(res.headers['retry-after']).toBe('60')
    expect(seen).toEqual(['otp-request:ip:203.0.113.5', 'otp-request:email:someone@example.com'])
    vi.unstubAllEnvs()
  })

  it('falls back to this process when a binding is missing', () => {
    const limits = authRateLimits(bindingRateLimiters({}))
    expect(limits.otpRequest).toBeTypeOf('function')
  })
})
