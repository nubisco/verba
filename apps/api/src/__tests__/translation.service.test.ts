import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../prisma.js', () => ({
  prisma: {
    translation: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    key: {
      findUnique: vi.fn(),
    },
    membership: {
      findUnique: vi.fn(),
    },
  },
}))

import { prisma } from '../prisma.js'
import {
  assignTranslation,
  getTranslation,
  nextStatusOnSave,
  updateStatus,
  upsertTranslation,
} from '../services/translation.service.js'
import { UpsertTranslationSchema } from '../schemas/translation.schema.js'
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
    vi.mocked(prisma.translation.findFirst).mockResolvedValue(t)
    vi.mocked(prisma.translation.update).mockResolvedValue({
      ...t,
      status: 'IN_PROGRESS',
    })
    const result = await updateStatus('p1', 't1', 'IN_PROGRESS', Role.TRANSLATOR)
    expect(result.status).toBe('IN_PROGRESS')
  })

  it('allows IN_PROGRESS → SUBMITTED (TRANSLATOR)', async () => {
    const t = makeTranslation('IN_PROGRESS')
    vi.mocked(prisma.translation.findFirst).mockResolvedValue(t)
    vi.mocked(prisma.translation.update).mockResolvedValue({
      ...t,
      status: 'SUBMITTED',
    })
    const result = await updateStatus('p1', 't1', 'SUBMITTED', Role.TRANSLATOR)
    expect(result.status).toBe('SUBMITTED')
  })

  it('allows SUBMITTED → APPROVED (MAINTAINER)', async () => {
    const t = makeTranslation('SUBMITTED')
    vi.mocked(prisma.translation.findFirst).mockResolvedValue(t)
    vi.mocked(prisma.translation.update).mockResolvedValue({
      ...t,
      status: 'APPROVED',
    })
    const result = await updateStatus('p1', 't1', 'APPROVED', Role.MAINTAINER)
    expect(result.status).toBe('APPROVED')
  })

  it('TRANSLATOR cannot approve: SUBMITTED → APPROVED throws 422', async () => {
    const t = makeTranslation('SUBMITTED')
    vi.mocked(prisma.translation.findFirst).mockResolvedValue(t)
    await expect(updateStatus('p1', 't1', 'APPROVED', Role.TRANSLATOR)).rejects.toMatchObject({
      statusCode: 422,
    })
  })

  it('MAINTAINER can approve: SUBMITTED → APPROVED', async () => {
    const t = makeTranslation('SUBMITTED')
    vi.mocked(prisma.translation.findFirst).mockResolvedValue(t)
    vi.mocked(prisma.translation.update).mockResolvedValue({
      ...t,
      status: 'APPROVED',
    })
    const result = await updateStatus('p1', 't1', 'APPROVED', Role.MAINTAINER)
    expect(result.status).toBe('APPROVED')
  })

  it('throws 422 for invalid transition TODO → APPROVED', async () => {
    const t = makeTranslation('TODO')
    vi.mocked(prisma.translation.findFirst).mockResolvedValue(t)
    await expect(updateStatus('p1', 't1', 'APPROVED', Role.ADMIN)).rejects.toMatchObject({
      statusCode: 422,
    })
  })

  it('allows APPROVED → IN_PROGRESS (MAINTAINER rejection)', async () => {
    const t = makeTranslation('APPROVED')
    vi.mocked(prisma.translation.findFirst).mockResolvedValue(t)
    vi.mocked(prisma.translation.update).mockResolvedValue({
      ...t,
      status: 'IN_PROGRESS',
    })
    const result = await updateStatus('p1', 't1', 'IN_PROGRESS', Role.MAINTAINER)
    expect(result.status).toBe('IN_PROGRESS')
  })

  it('READER cannot transition anything (throws 422)', async () => {
    const t = makeTranslation('TODO')
    vi.mocked(prisma.translation.findFirst).mockResolvedValue(t)
    await expect(updateStatus('p1', 't1', 'IN_PROGRESS', Role.READER)).rejects.toMatchObject({
      statusCode: 422,
    })
  })

  it('throws 422 for invalid transition APPROVED → TODO', async () => {
    const t = makeTranslation('APPROVED')
    vi.mocked(prisma.translation.findFirst).mockResolvedValue(t)
    await expect(updateStatus('p1', 't1', 'TODO', Role.ADMIN)).rejects.toMatchObject({
      statusCode: 422,
    })
  })

  it('throws 422 for invalid transition IN_PROGRESS → APPROVED', async () => {
    const t = makeTranslation('IN_PROGRESS')
    vi.mocked(prisma.translation.findFirst).mockResolvedValue(t)
    await expect(updateStatus('p1', 't1', 'APPROVED', Role.ADMIN)).rejects.toMatchObject({
      statusCode: 422,
    })
  })

  it('throws 404 when translation not found', async () => {
    vi.mocked(prisma.translation.findFirst).mockResolvedValue(null)
    await expect(updateStatus('p1', 'nonexistent', 'IN_PROGRESS', Role.TRANSLATOR)).rejects.toMatchObject({
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

describe('cross-project isolation', () => {
  it('finds a translation only through the project in the URL', async () => {
    vi.mocked(prisma.translation.findFirst).mockResolvedValue(null)
    await expect(getTranslation('p1', 't-of-p2')).rejects.toMatchObject({ statusCode: 404 })
    expect(prisma.translation.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 't-of-p2', key: { projectId: 'p1' } } }),
    )
  })

  it("refuses to change the status of another project's translation", async () => {
    // An ADMIN of p1 aiming at a translation that lives in p2: the lookup is
    // scoped to p1, so the row is not found and nothing is written.
    vi.mocked(prisma.translation.findFirst).mockResolvedValue(null)
    await expect(updateStatus('p1', 't-of-p2', 'APPROVED', Role.ADMIN)).rejects.toMatchObject({ statusCode: 404 })
    expect(prisma.translation.findFirst).toHaveBeenCalledWith({ where: { id: 't-of-p2', key: { projectId: 'p1' } } })
    expect(prisma.translation.update).not.toHaveBeenCalled()
  })

  it('assigns work only to members of the project', async () => {
    vi.mocked(prisma.translation.findUnique).mockResolvedValue({
      ...makeTranslation('TODO'),
      key: { projectId: 'p1' },
    } as never)
    vi.mocked(prisma.membership.findUnique).mockResolvedValue(null)
    await expect(assignTranslation('p1', 't1', 'outsider', Role.ADMIN, 'admin')).rejects.toMatchObject({
      statusCode: 422,
    })
    expect(prisma.translation.update).not.toHaveBeenCalled()
  })
})

describe('the workflow cannot be skipped by saving', () => {
  it('rejects a client that sends a status or an author with its text', () => {
    expect(UpsertTranslationSchema.safeParse({ text: 'Hi', status: 'APPROVED' }).success).toBe(false)
    expect(UpsertTranslationSchema.safeParse({ text: 'Hi', updatedById: 'someone-else' }).success).toBe(false)
    expect(UpsertTranslationSchema.parse({ text: 'Hi', source: 'ai' })).toEqual({ text: 'Hi', source: 'ai' })
  })

  it('records the signed-in user as the author, whatever the input says', async () => {
    vi.mocked(prisma.translation.findUnique).mockResolvedValue(makeTranslation('TODO'))
    vi.mocked(prisma.translation.update).mockResolvedValue(makeTranslation('IN_PROGRESS'))
    vi.mocked(prisma.key.findUnique).mockResolvedValue(null)
    await upsertTranslation('k1', 'l1', { text: 'New' }, 'u-me', Role.TRANSLATOR)
    expect(vi.mocked(prisma.translation.update).mock.calls[0][0].data).toMatchObject({
      updatedById: 'u-me',
      status: 'IN_PROGRESS',
    })
  })

  it('sends approved text a translator edits back to IN_PROGRESS', async () => {
    vi.mocked(prisma.translation.findUnique).mockResolvedValue(makeTranslation('APPROVED'))
    vi.mocked(prisma.translation.update).mockResolvedValue(makeTranslation('IN_PROGRESS'))
    vi.mocked(prisma.key.findUnique).mockResolvedValue(null)
    await upsertTranslation('k1', 'l1', { text: 'Changed' }, 'u-me', Role.TRANSLATOR)
    expect(vi.mocked(prisma.translation.update).mock.calls[0][0].data).toMatchObject({ status: 'IN_PROGRESS' })
  })

  it('decides the status after a save', () => {
    expect(nextStatusOnSave('TODO', true, undefined, Role.TRANSLATOR)).toBe('IN_PROGRESS')
    expect(nextStatusOnSave('APPROVED', true, undefined, Role.TRANSLATOR)).toBe('IN_PROGRESS')
    expect(nextStatusOnSave('SUBMITTED', true, undefined, Role.TRANSLATOR)).toBe('IN_PROGRESS')
    expect(nextStatusOnSave('APPROVED', true, undefined, Role.MAINTAINER)).toBe('APPROVED')
    expect(nextStatusOnSave('APPROVED', false, undefined, Role.TRANSLATOR)).toBe('APPROVED')
    // An import passes the status it read from the file.
    expect(nextStatusOnSave('TODO', true, 'APPROVED', Role.MAINTAINER)).toBe('APPROVED')
  })
})
