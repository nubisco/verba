import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// A user who is ADMIN of project p1 and nothing else, aiming at rows that live
// in project p2. Every route is nested under p1, where the role check passes,
// so the only thing standing between them and p2 is the row lookup.

vi.mock('../prisma.js', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    membership: { findFirst: vi.fn() },
    key: { findFirst: vi.fn(), findUnique: vi.fn() },
    locale: { findFirst: vi.fn() },
    translation: { findFirst: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
    comment: { findMany: vi.fn() },
    auditLog: { findMany: vi.fn() },
  },
}))

vi.mock('../services/analytics.service.js', () => ({ track: vi.fn() }))

import { buildApp } from '../app.js'
import { prisma } from '../prisma.js'

describe('routes nested under a project only reach that project', () => {
  let app: ReturnType<typeof buildApp>
  let cookies: Record<string, string>

  beforeEach(async () => {
    vi.clearAllMocks()
    vi.stubEnv('JWT_SECRET', 'test-secret')
    app = buildApp()
    await app.ready()
    cookies = { token: app.jwt.sign({ userId: 'u-admin-p1', email: 'a@example.com' }) }
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ isGlobalAdmin: false } as never)
    vi.mocked(prisma.membership.findFirst).mockResolvedValue({
      id: 'm',
      userId: 'u-admin-p1',
      projectId: 'p1',
      role: 'ADMIN',
      namespaces: '[]',
      assignedLocales: '[]',
    } as never)
  })

  afterEach(async () => {
    await app.close()
    vi.unstubAllEnvs()
  })

  it('PATCH status: a translation of another project is not found, and not changed', async () => {
    vi.mocked(prisma.translation.findFirst).mockResolvedValue(null)
    const res = await app.inject({
      method: 'PATCH',
      url: '/projects/p1/translations/t-of-p2/status',
      cookies,
      payload: { status: 'APPROVED' },
    })
    expect(res.statusCode).toBe(404)
    expect(prisma.translation.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 't-of-p2', key: { projectId: 'p1' } } }),
    )
    expect(prisma.translation.update).not.toHaveBeenCalled()
  })

  it("GET translation: another project's translation is not returned", async () => {
    vi.mocked(prisma.translation.findFirst).mockResolvedValue(null)
    const res = await app.inject({ method: 'GET', url: '/projects/p1/translations/t-of-p2', cookies })
    expect(res.statusCode).toBe(404)
  })

  it('PUT translation: a locale of another project is refused before anything is written', async () => {
    vi.mocked(prisma.key.findFirst).mockResolvedValue({
      id: 'k1',
      projectId: 'p1',
      namespaceId: 'ns1',
      name: 'hello',
      namespace: { id: 'ns1', slug: 'app' },
    } as never)
    vi.mocked(prisma.locale.findFirst).mockResolvedValue(null)
    const res = await app.inject({
      method: 'PUT',
      url: '/projects/p1/keys/k1/translations/l-of-p2',
      cookies,
      payload: { text: 'Hola' },
    })
    expect(res.statusCode).toBe(404)
    expect(prisma.locale.findFirst).toHaveBeenCalledWith({ where: { id: 'l-of-p2', projectId: 'p1' } })
    expect(prisma.translation.create).not.toHaveBeenCalled()
    expect(prisma.translation.update).not.toHaveBeenCalled()
  })

  it('GET key history: a key of another project leaks no comments or authors', async () => {
    vi.mocked(prisma.key.findFirst).mockResolvedValue(null)
    const res = await app.inject({ method: 'GET', url: '/projects/p1/keys/k-of-p2/history', cookies })
    expect(res.statusCode).toBe(404)
    expect(prisma.key.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'k-of-p2', projectId: 'p1' } }),
    )
    expect(prisma.translation.findMany).not.toHaveBeenCalled()
    expect(prisma.comment.findMany).not.toHaveBeenCalled()
  })

  it("GET comments: the thread of another project's translation is not returned", async () => {
    vi.mocked(prisma.translation.findFirst).mockResolvedValue(null)
    const res = await app.inject({ method: 'GET', url: '/projects/p1/translations/t-of-p2/comments', cookies })
    expect(res.statusCode).toBe(404)
    expect(prisma.comment.findMany).not.toHaveBeenCalled()
  })

  it('PUT translation: a client cannot set the status, so a translator cannot approve', async () => {
    vi.mocked(prisma.membership.findFirst).mockResolvedValue({
      id: 'm',
      userId: 'u-admin-p1',
      projectId: 'p1',
      role: 'TRANSLATOR',
      namespaces: '[]',
      assignedLocales: '[]',
    } as never)
    vi.mocked(prisma.key.findFirst).mockResolvedValue({
      id: 'k1',
      projectId: 'p1',
      namespaceId: 'ns1',
      name: 'hello',
      namespace: { id: 'ns1', slug: 'app' },
    } as never)
    vi.mocked(prisma.locale.findFirst).mockResolvedValue({ id: 'l1', projectId: 'p1' } as never)
    const res = await app.inject({
      method: 'PUT',
      url: '/projects/p1/keys/k1/translations/l1',
      cookies,
      payload: { text: 'Hola', status: 'APPROVED' },
    })
    expect(res.statusCode).toBe(400)
    expect(prisma.translation.create).not.toHaveBeenCalled()
    expect(prisma.translation.update).not.toHaveBeenCalled()
  })
})
