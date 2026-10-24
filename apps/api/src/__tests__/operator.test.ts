import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../prisma.js', () => ({
  prisma: {
    user: { findUnique: vi.fn(), update: vi.fn(), findMany: vi.fn() },
    instanceAuditLog: { create: vi.fn(), findMany: vi.fn() },
    membership: { findUnique: vi.fn() },
  },
}))

import { buildApp } from '../app.js'
import { prisma } from '../prisma.js'
import { isOperator, isOperatorEmail, operatorEmails, syncOperatorFlag } from '../services/operator.service.js'
import { deactivateUser, deleteUser } from '../services/auth.service.js'

describe('instance operators come from VERBA_OPERATORS', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('VERBA_OPERATORS', ' Ops@Example.com, second@example.com ')
  })
  afterEach(() => vi.unstubAllEnvs())

  it('reads a normalised, comma-separated list', () => {
    expect([...operatorEmails()]).toEqual(['ops@example.com', 'second@example.com'])
    expect(isOperatorEmail('OPS@example.com')).toBe(true)
    expect(isOperatorEmail('first-user@example.com')).toBe(false)
    expect(operatorEmails('').size).toBe(0)
  })

  it('is decided by the configuration, not the cached flag', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
      email: 'first-user@example.com',
      deactivatedAt: null,
      isGlobalAdmin: true,
    } as never)
    expect(await isOperator('u-first')).toBe(false)

    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
      email: 'ops@example.com',
      deactivatedAt: new Date(),
    } as never)
    expect(await isOperator('u-ops-deactivated')).toBe(false)
  })

  it('records a grant when the flag catches up with the configuration', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ email: 'ops@example.com', isGlobalAdmin: false } as never)
    await syncOperatorFlag('u-ops')
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'u-ops' }, data: { isGlobalAdmin: true } })
    expect(prisma.instanceAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'operator.granted', targetUserId: 'u-ops', actorId: null }),
    })
  })

  it('records a revocation for the account that was operator by arriving first', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      email: 'first-user@example.com',
      isGlobalAdmin: true,
    } as never)
    await syncOperatorFlag('u-first')
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'u-first' }, data: { isGlobalAdmin: false } })
    expect(prisma.instanceAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'operator.revoked', targetUserId: 'u-first' }),
    })
  })

  it('writes nothing when nothing changed', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ email: 'ops@example.com', isGlobalAdmin: true } as never)
    await syncOperatorFlag('u-ops')
    expect(prisma.user.update).not.toHaveBeenCalled()
    expect(prisma.instanceAuditLog.create).not.toHaveBeenCalled()
  })

  it('audits an operator deactivating someone else', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'u-ops', email: 'ops@example.com' } as never)
    await deactivateUser('u-target', 'u-ops')
    expect(prisma.instanceAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'user.deactivated', actorId: 'u-ops', targetUserId: 'u-target' }),
    })
  })

  it('does not let a non-operator deactivate someone else, whatever the cached flag says', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'u-first',
      email: 'first-user@example.com',
      isGlobalAdmin: true,
    } as never)
    await expect(deactivateUser('u-target', 'u-first')).rejects.toMatchObject({ statusCode: 403 })
    expect(prisma.user.update).not.toHaveBeenCalled()
  })

  it('will not delete an account that is still named in VERBA_OPERATORS', async () => {
    vi.mocked(prisma.user.findUnique)
      .mockResolvedValueOnce({ id: 'u-ops', email: 'ops@example.com' } as never)
      .mockResolvedValueOnce({ id: 'u-two', email: 'second@example.com' } as never)
    await expect(deleteUser('u-two', 'u-ops')).rejects.toMatchObject({ statusCode: 403 })
  })
})

describe('admin routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('JWT_SECRET', 'test-secret')
    vi.stubEnv('VERBA_OPERATORS', 'ops@example.com')
  })
  afterEach(() => vi.unstubAllEnvs())

  async function get(email: string) {
    const app = buildApp()
    await app.ready()
    const token = app.jwt.sign({ userId: 'u1', email })
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ email, deactivatedAt: null, isGlobalAdmin: true } as never)
    vi.mocked(prisma.user.findMany).mockResolvedValue([])
    vi.mocked(prisma.instanceAuditLog.findMany).mockResolvedValue([])
    const users = await app.inject({ method: 'GET', url: '/admin/users', cookies: { token } })
    const audit = await app.inject({ method: 'GET', url: '/admin/audit', cookies: { token } })
    await app.close()
    return { users: users.statusCode, audit: audit.statusCode }
  }

  it('are refused to the first user ever, now that arriving first grants nothing', async () => {
    expect(await get('first-user@example.com')).toEqual({ users: 403, audit: 403 })
  })

  it('are open to a configured operator, including the audit record', async () => {
    expect(await get('ops@example.com')).toEqual({ users: 200, audit: 200 })
  })
})
