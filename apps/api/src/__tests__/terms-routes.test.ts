import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The terms gate (session.ts) and what /config tells the sign-in page.

vi.mock('../prisma.js', () => ({
  prisma: {
    user: { findUnique: vi.fn(), update: vi.fn(), count: vi.fn() },
    instanceAuditLog: { create: vi.fn() },
    account: { findMany: vi.fn(async () => []) },
    accountMember: { findMany: vi.fn(async () => []) },
  },
}))

vi.mock('../services/operator.service.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/operator.service.js')>()),
  syncOperatorFlag: vi.fn(),
}))

import { buildApp } from '../app.js'
import { inject, signToken } from './inject.js'
import { prisma } from '../prisma.js'

const user = (termsVersion: string | null) => ({
  id: 'u1',
  email: 'a@example.com',
  name: null,
  preferredLocales: '[]',
  notificationOpenMode: 'inspector',
  avatarUrl: null,
  platformRole: null,
  createdAt: new Date('2026-11-01T00:00:00Z'),
  deactivatedAt: null,
  termsVersion,
})

function tokenOf(res: { cookies: Array<{ name: string; value: string }> }): string | undefined {
  return res.cookies.find((c) => c.name === 'token')?.value
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('JWT_SECRET', 'test-secret')
})

afterEach(() => vi.unstubAllEnvs())

describe('/config', () => {
  it('reports sign-up open and no terms on a self-hosted instance with nothing set', async () => {
    const app = await buildApp()
    const config = (await inject(app, { method: 'GET', url: '/config' })).json()
    expect(config.signup).toEqual({ open: true, terms: null })
    expect(config.features.checkout).toBe(false)
    expect(config.salesUrl).toBeNull()
  })

  it('reports sign-up closed and the terms when they are set', async () => {
    vi.stubEnv('VERBA_SIGNUP_OPEN', 'false')
    vi.stubEnv('VERBA_TERMS_VERSION', 'v2')
    vi.stubEnv('VERBA_TERMS_URL', 'https://example.com/terms')
    const app = await buildApp()
    const config = (await inject(app, { method: 'GET', url: '/config' })).json()
    expect(config.signup).toEqual({
      open: false,
      terms: { version: 'v2', termsUrl: 'https://example.com/terms', privacyUrl: null },
    })
  })
})

describe('the terms gate', () => {
  it('lets every route through on an instance without terms', async () => {
    const app = await buildApp()
    const cookies = { token: await signToken({ userId: 'u1', email: 'a@example.com' }) }
    const res = await inject(app, { method: 'GET', url: '/accounts', cookies })
    expect(res.statusCode).toBe(200)
  })

  describe('with terms', () => {
    beforeEach(() => vi.stubEnv('VERBA_TERMS_VERSION', 'v2'))

    it('refuses everything but /auth until the current version is accepted', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(user('v1') as never)
      const app = await buildApp()
      const cookies = { token: await signToken({ userId: 'u1', email: 'a@example.com', terms: 'v1' }) }

      const refused = await inject(app, { method: 'GET', url: '/accounts', cookies })
      expect(refused.statusCode).toBe(403)
      expect(refused.json()).toMatchObject({ code: 'terms_required', terms: { version: 'v2' } })

      const me = await inject(app, { method: 'GET', url: '/auth/me', cookies })
      expect(me.statusCode).toBe(200)
      expect(me.json().terms).toMatchObject({ version: 'v2', accepted: false })
    })

    it('records an acceptance and reissues the session, which then passes', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(user(null) as never)
      const app = await buildApp()
      const cookies = { token: await signToken({ userId: 'u1', email: 'a@example.com' }) }

      const stale = await inject(app, { method: 'POST', url: '/auth/me/terms', cookies, payload: { version: 'v1' } })
      expect(stale.statusCode).toBe(409)
      expect(prisma.user.update).not.toHaveBeenCalled()

      vi.mocked(prisma.user.update).mockResolvedValue(user('v2') as never)
      const ok = await inject(app, { method: 'POST', url: '/auth/me/terms', cookies, payload: { version: 'v2' } })
      expect(ok.statusCode).toBe(200)
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { termsVersion: 'v2', termsAcceptedAt: expect.any(Date) },
      })
      // The acceptance is an event too, kept beyond the latest on the user.
      expect(prisma.instanceAuditLog.create).toHaveBeenCalledWith({
        data: {
          actorId: 'u1',
          action: 'terms.accepted',
          targetUserId: 'u1',
          detail: expect.stringContaining('"version":"v2"'),
        },
      })
      const token = tokenOf(ok)
      expect(token).toBeTruthy()

      const after = await inject(app, { method: 'GET', url: '/accounts', cookies: { token: token! } })
      expect(after.statusCode).toBe(200)
    })

    it('brings a session up to date when the person accepted in another browser', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(user('v2') as never)
      const app = await buildApp()
      const cookies = { token: await signToken({ userId: 'u1', email: 'a@example.com' }) }
      const me = await inject(app, { method: 'GET', url: '/auth/me', cookies })
      expect(me.json().terms).toMatchObject({ accepted: true })
      const token = tokenOf(me)
      expect(token).toBeTruthy()
      const after = await inject(app, { method: 'GET', url: '/accounts', cookies: { token: token! } })
      expect(after.statusCode).toBe(200)
    })

    it('asks again when the version changes', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(user('v2') as never)
      const app = await buildApp()
      const cookies = { token: await signToken({ userId: 'u1', email: 'a@example.com', terms: 'v2' }) }
      expect((await inject(app, { method: 'GET', url: '/accounts', cookies })).statusCode).toBe(200)

      vi.stubEnv('VERBA_TERMS_VERSION', 'v3')
      const refused = await inject(app, { method: 'GET', url: '/accounts', cookies })
      expect(refused.statusCode).toBe(403)
      expect(refused.json().code).toBe('terms_required')
    })
  })
})
