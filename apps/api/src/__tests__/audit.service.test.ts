import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../prisma.js', () => ({
  prisma: {
    auditLog: {
      create: vi.fn(),
    },
  },
}))

import { prisma } from '../prisma.js'
import { log } from '../services/audit.service.js'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('audit.log', () => {
  it('creates an audit log entry with correct shape', async () => {
    vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never)
    await log({
      projectId: 'p1',
      userId: 'u1',
      action: 'key.created',
      entityType: 'Key',
      entityId: 'k1',
      after: { name: 'hello' },
    })
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        projectId: 'p1',
        userId: 'u1',
        action: 'key.created',
        entityType: 'Key',
        entityId: 'k1',
        before: undefined,
        after: JSON.stringify({ name: 'hello' }),
      },
    })
  })

  it('does not throw when Prisma fails', async () => {
    vi.mocked(prisma.auditLog.create).mockRejectedValue(new Error('DB error'))
    await expect(
      log({
        projectId: 'p1',
        action: 'key.created',
        entityType: 'Key',
        entityId: 'k1',
      }),
    ).resolves.toBeUndefined()
  })
})
