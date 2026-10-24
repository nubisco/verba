import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../prisma.js', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
  },
}))

vi.mock('../services/auth.service.js', () => ({
  getMe: vi.fn(async (id: string) => ({ id, email: 'a@example.com' })),
}))

import { buildApp } from '../app.js'
import { prisma } from '../prisma.js'
import { issueSession, sessionTtlSeconds } from '../session.js'

const DAY = 24 * 3600 * 1000

function cookieNamed(res: { cookies: Array<{ name: string } & Record<string, unknown>> }, name: string) {
  return res.cookies.find((c) => c.name === name)
}

describe('sessions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('JWT_SECRET', 'test-secret')
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-24T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
  })

  async function appWithRoute() {
    const app = buildApp()
    app.get('/test/issue', async (_req, reply) => {
      issueSession(app, reply, { userId: 'u1', email: 'a@example.com' })
      return { ok: true }
    })
    await app.ready()
    return app
  }

  it('sets the session cookie httpOnly, sameSite=lax, secure in production, with an expiry', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    const app = await appWithRoute()
    const res = await app.inject({ method: 'GET', url: '/test/issue' })
    await app.close()
    const cookie = cookieNamed(res, 'token')
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'Lax', secure: true, path: '/' })
    expect(cookie?.maxAge).toBe(sessionTtlSeconds())
    const payload = JSON.parse(Buffer.from(String(cookie?.value).split('.')[1], 'base64url').toString())
    expect(payload.exp - payload.iat).toBe(sessionTtlSeconds())
  })

  it('lets COOKIE_SECURE=false serve a production instance over plain HTTP', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('COOKIE_SECURE', 'false')
    const app = await appWithRoute()
    const res = await app.inject({ method: 'GET', url: '/test/issue' })
    await app.close()
    expect(cookieNamed(res, 'token')?.secure).toBeFalsy()
  })

  it('refuses a session past its expiry', async () => {
    const app = await appWithRoute()
    const issued = await app.inject({ method: 'GET', url: '/test/issue' })
    const token = String(cookieNamed(issued, 'token')?.value)
    vi.setSystemTime(Date.now() + sessionTtlSeconds() * 1000 + 1000)
    const res = await app.inject({ method: 'GET', url: '/auth/me', cookies: { token } })
    await app.close()
    expect(res.statusCode).toBe(401)
  })

  it('retires a session signed before sessions expired, once it is older than the TTL', async () => {
    const app = await appWithRoute()
    // What every release before this one issued: no exp claim at all.
    const legacy = app.jwt.sign({ userId: 'u1', email: 'a@example.com' })
    vi.setSystemTime(Date.now() + sessionTtlSeconds() * 1000 + 1000)
    const res = await app.inject({ method: 'GET', url: '/auth/me', cookies: { token: legacy } })
    await app.close()
    expect(res.statusCode).toBe(401)
  })

  it('renews an active session once it is a day old', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ deactivatedAt: null } as never)
    const app = await appWithRoute()
    const issued = await app.inject({ method: 'GET', url: '/test/issue' })
    const token = String(cookieNamed(issued, 'token')?.value)

    const fresh = await app.inject({ method: 'GET', url: '/auth/me', cookies: { token } })
    expect(cookieNamed(fresh, 'token')).toBeUndefined()

    vi.setSystemTime(Date.now() + DAY + 1000)
    const renewed = await app.inject({ method: 'GET', url: '/auth/me', cookies: { token } })
    await app.close()
    expect(renewed.statusCode).toBe(200)
    const next = cookieNamed(renewed, 'token')
    expect(next?.value).toBeTruthy()
    expect(next?.value).not.toBe(token)
  })

  it('ends the session of a deactivated account at renewal', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ deactivatedAt: new Date() } as never)
    const app = await appWithRoute()
    const issued = await app.inject({ method: 'GET', url: '/test/issue' })
    const token = String(cookieNamed(issued, 'token')?.value)
    vi.setSystemTime(Date.now() + DAY + 1000)
    const res = await app.inject({ method: 'GET', url: '/auth/me', cookies: { token } })
    await app.close()
    expect(res.statusCode).toBe(401)
  })
})
