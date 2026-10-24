import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../prisma.js', () => ({
  prisma: {
    user: { findUnique: vi.fn(), findMany: vi.fn() },
    membership: { findMany: vi.fn(), findUnique: vi.fn(), upsert: vi.fn() },
  },
}))

vi.mock('../services/analytics.service.js', () => ({ track: vi.fn() }))

import { buildApp } from '../app.js'
import { prisma } from '../prisma.js'
import { findActiveUserByEmail, searchCoMembers } from '../services/auth.service.js'

describe('searchCoMembers', () => {
  beforeEach(() => vi.clearAllMocks())

  it('searches only people who share a project with the caller', async () => {
    vi.mocked(prisma.membership.findMany).mockResolvedValue([{ projectId: 'p1' }, { projectId: 'p2' }] as never)
    vi.mocked(prisma.user.findMany).mockResolvedValue([])
    await searchCoMembers('caller', 'Ali')
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          email: { contains: 'ali' },
          deactivatedAt: null,
          memberships: { some: { projectId: { in: ['p1', 'p2'] } } },
        },
      }),
    )
  })

  it('returns nobody to a caller with no projects, rather than the whole instance', async () => {
    vi.mocked(prisma.membership.findMany).mockResolvedValue([])
    expect(await searchCoMembers('caller', 'alice')).toEqual([])
    expect(prisma.user.findMany).not.toHaveBeenCalled()
  })

  it('ignores one-letter fragments that would list everyone in reach', async () => {
    expect(await searchCoMembers('caller', 'a')).toEqual([])
    expect(prisma.membership.findMany).not.toHaveBeenCalled()
  })
})

describe('findActiveUserByEmail', () => {
  beforeEach(() => vi.clearAllMocks())

  it('matches the exact, normalised address and skips deactivated accounts', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({ id: 'u1', deactivatedAt: null } as never)
    expect(await findActiveUserByEmail(' Alice@Example.com ')).toEqual({ id: 'u1' })
    expect(prisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: 'alice@example.com' } }),
    )

    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({ id: 'u2', deactivatedAt: new Date() } as never)
    expect(await findActiveUserByEmail('gone@example.com')).toBeNull()
  })
})

describe('adding a member', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('JWT_SECRET', 'test-secret')
  })

  async function asProjectAdmin() {
    const app = buildApp()
    await app.ready()
    const token = app.jwt.sign({ userId: 'admin', email: 'admin@example.com' })
    vi.mocked(prisma.membership.findUnique).mockResolvedValue({
      id: 'm',
      userId: 'admin',
      projectId: 'p1',
      role: 'ADMIN',
      namespaces: '[]',
      assignedLocales: '[]',
    } as never)
    return { app, cookies: { token } }
  }

  it('takes an email address and resolves it on the server', async () => {
    const { app, cookies } = await asProjectAdmin()
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'u9', deactivatedAt: null } as never)
    vi.mocked(prisma.membership.upsert).mockResolvedValue({
      id: 'm9',
      userId: 'u9',
      projectId: 'p1',
      role: 'READER',
      namespaces: '[]',
      assignedLocales: '[]',
    } as never)
    const res = await app.inject({
      method: 'POST',
      url: '/projects/p1/members',
      cookies,
      payload: { email: 'bob@example.com', role: 'READER' },
    })
    await app.close()
    expect(res.statusCode).toBe(201)
    expect(prisma.membership.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId_projectId: { userId: 'u9', projectId: 'p1' } } }),
    )
  })

  it('no longer accepts a raw user id', async () => {
    const { app, cookies } = await asProjectAdmin()
    const res = await app.inject({
      method: 'POST',
      url: '/projects/p1/members',
      cookies,
      payload: { userId: 'u9', role: 'ADMIN' },
    })
    await app.close()
    expect(res.statusCode).toBe(400)
    expect(prisma.membership.upsert).not.toHaveBeenCalled()
  })

  it('answers 404 when no active account uses the address', async () => {
    const { app, cookies } = await asProjectAdmin()
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null)
    const res = await app.inject({
      method: 'POST',
      url: '/projects/p1/members',
      cookies,
      payload: { email: 'nobody@example.com', role: 'READER' },
    })
    await app.close()
    expect(res.statusCode).toBe(404)
  })
})
