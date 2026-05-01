import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../prisma.js', () => ({
  prisma: {
    translation: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    key: {
      findUnique: vi.fn(),
    },
  },
}))

import { prisma } from '../prisma.js'
import { updateStatus, upsertTranslation } from '../services/translation.service.js'
import { Role } from '../types.js'

const makeTranslation = (status: string) => ({
  id: 't1',
  keyId: 'k1',
  localeId: 'l1',
  text: 'Hello',
  status,
  version: 1,
  updatedById: null,
  assignedToId: null,
  updatedAt: new Date(),
  deletedAt: null,
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe('updateStatus: workflow enforcement', () => {
  it('allows TODO → IN_PROGRESS (TRANSLATOR)', async () => {
    const t = makeTranslation('TODO')
    vi.mocked(prisma.translation.findUnique).mockResolvedValue(t)
    vi.mocked(prisma.translation.update).mockResolvedValue({
      ...t,
      status: 'IN_PROGRESS',
    })
    const result = await updateStatus('t1', 'IN_PROGRESS', Role.TRANSLATOR)
    expect(result.status).toBe('IN_PROGRESS')
  })

  it('allows IN_PROGRESS → SUBMITTED (TRANSLATOR)', async () => {
    const t = makeTranslation('IN_PROGRESS')
    vi.mocked(prisma.translation.findUnique).mockResolvedValue(t)
    vi.mocked(prisma.translation.update).mockResolvedValue({
      ...t,
      status: 'SUBMITTED',
    })
    const result = await updateStatus('t1', 'SUBMITTED', Role.TRANSLATOR)
    expect(result.status).toBe('SUBMITTED')
  })

  it('allows SUBMITTED → APPROVED (MAINTAINER)', async () => {
    const t = makeTranslation('SUBMITTED')
    vi.mocked(prisma.translation.findUnique).mockResolvedValue(t)
    vi.mocked(prisma.translation.update).mockResolvedValue({
      ...t,
      status: 'APPROVED',
    })
    const result = await updateStatus('t1', 'APPROVED', Role.MAINTAINER)
    expect(result.status).toBe('APPROVED')
  })

  it('TRANSLATOR cannot approve: SUBMITTED → APPROVED throws 422', async () => {
    const t = makeTranslation('SUBMITTED')
    vi.mocked(prisma.translation.findUnique).mockResolvedValue(t)
    await expect(updateStatus('t1', 'APPROVED', Role.TRANSLATOR)).rejects.toMatchObject({
      statusCode: 422,
    })
  })

  it('MAINTAINER can approve: SUBMITTED → APPROVED', async () => {
    const t = makeTranslation('SUBMITTED')
    vi.mocked(prisma.translation.findUnique).mockResolvedValue(t)
    vi.mocked(prisma.translation.update).mockResolvedValue({
      ...t,
      status: 'APPROVED',
    })
    const result = await updateStatus('t1', 'APPROVED', Role.MAINTAINER)
    expect(result.status).toBe('APPROVED')
  })

  it('throws 422 for invalid transition TODO → APPROVED', async () => {
    const t = makeTranslation('TODO')
    vi.mocked(prisma.translation.findUnique).mockResolvedValue(t)
    await expect(updateStatus('t1', 'APPROVED', Role.ADMIN)).rejects.toMatchObject({
      statusCode: 422,
    })
  })

  it('allows APPROVED → IN_PROGRESS (MAINTAINER rejection)', async () => {
    const t = makeTranslation('APPROVED')
    vi.mocked(prisma.translation.findUnique).mockResolvedValue(t)
    vi.mocked(prisma.translation.update).mockResolvedValue({
      ...t,
      status: 'IN_PROGRESS',
    })
    const result = await updateStatus('t1', 'IN_PROGRESS', Role.MAINTAINER)
    expect(result.status).toBe('IN_PROGRESS')
  })

  it('READER cannot transition anything (throws 422)', async () => {
    const t = makeTranslation('TODO')
    vi.mocked(prisma.translation.findUnique).mockResolvedValue(t)
    await expect(updateStatus('t1', 'IN_PROGRESS', Role.READER)).rejects.toMatchObject({
      statusCode: 422,
    })
  })

  it('throws 422 for invalid transition APPROVED → TODO', async () => {
    const t = makeTranslation('APPROVED')
    vi.mocked(prisma.translation.findUnique).mockResolvedValue(t)
    await expect(updateStatus('t1', 'TODO', Role.ADMIN)).rejects.toMatchObject({
      statusCode: 422,
    })
  })

  it('throws 422 for invalid transition IN_PROGRESS → APPROVED', async () => {
    const t = makeTranslation('IN_PROGRESS')
    vi.mocked(prisma.translation.findUnique).mockResolvedValue(t)
    await expect(updateStatus('t1', 'APPROVED', Role.ADMIN)).rejects.toMatchObject({
      statusCode: 422,
    })
  })

  it('throws 404 when translation not found', async () => {
    vi.mocked(prisma.translation.findUnique).mockResolvedValue(null)
    await expect(updateStatus('nonexistent', 'IN_PROGRESS', Role.TRANSLATOR)).rejects.toMatchObject({
      statusCode: 404,
    })
  })
})

describe('upsertTranslation', () => {
  it('creates new translation when none exists', async () => {
    const created = makeTranslation('TODO')
    vi.mocked(prisma.translation.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.translation.create).mockResolvedValue(created)
    const result = await upsertTranslation('k1', 'l1', { text: 'Hello' })
    expect(result).toEqual(created)
  })

  it('increments version when text changes', async () => {
    const existing = makeTranslation('TODO')
    const updated = { ...existing, text: 'World', version: 2 }
    vi.mocked(prisma.translation.findUnique).mockResolvedValue(existing)
    vi.mocked(prisma.translation.update).mockResolvedValue(updated)
    const result = await upsertTranslation('k1', 'l1', { text: 'World' })
    expect(result.version).toBe(2)
  })

  it('does not increment version when text is unchanged', async () => {
    const existing = makeTranslation('TODO')
    vi.mocked(prisma.translation.findUnique).mockResolvedValue(existing)
    vi.mocked(prisma.translation.update).mockResolvedValue(existing)
    await upsertTranslation('k1', 'l1', { text: 'Hello' })
    const updateCall = vi.mocked(prisma.translation.update).mock.calls[0][0]
    expect(updateCall.data.version).toBe(1)
  })
})
