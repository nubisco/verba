import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../prisma.js', () => ({
  prisma: {
    comment: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    translation: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    membership: {
      findMany: vi.fn(),
    },
  },
}))

vi.mock('../ws/index.js', () => ({
  wsManager: {
    broadcast: vi.fn(),
    notifyUser: vi.fn(),
  },
}))

vi.mock('../services/notification.service.js', () => ({
  createNotification: vi.fn(),
}))

import { prisma } from '../prisma.js'
import { wsManager } from '../ws/index.js'
import { addComment, listComments, deleteComment } from '../services/comment.service.js'

beforeEach(() => {
  vi.clearAllMocks()
  // Default: translation exists, no mentions, no assignees
  vi.mocked(prisma.translation.findFirst).mockResolvedValue({
    keyId: 'k1',
  } as never)
  vi.mocked(prisma.membership.findMany).mockResolvedValue([])
  vi.mocked(prisma.translation.findMany).mockResolvedValue([])
})

describe('addComment', () => {
  it('creates a comment and returns it', async () => {
    const mockComment = {
      id: 'c1',
      translationId: 't1',
      userId: 'u1',
      text: 'Hello',
      createdAt: new Date(),
      user: { id: 'u1', email: 'user@example.com' },
    }
    vi.mocked(prisma.comment.create).mockResolvedValue(mockComment as never)

    const result = await addComment('t1', 'u1', 'Hello', 'p1')

    expect(prisma.comment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          translationId: 't1',
          userId: 'u1',
          text: 'Hello',
        }),
        include: { user: { select: { id: true, email: true, name: true } } },
      }),
    )
    expect(result).toEqual(mockComment)
  })

  it('broadcasts comment.added via wsManager', async () => {
    const mockComment = {
      id: 'c2',
      translationId: 't2',
      userId: 'u1',
      text: 'WS test',
      createdAt: new Date(),
      user: { id: 'u1', email: 'user@example.com' },
    }
    vi.mocked(prisma.comment.create).mockResolvedValue(mockComment as never)

    await addComment('t2', 'u1', 'WS test', 'p2')

    expect(wsManager.broadcast).toHaveBeenCalledWith('p2', {
      type: 'comment.added',
      translationId: 't2',
      comment: mockComment,
    })
  })
})

describe('listComments', () => {
  it('returns comments ordered by createdAt asc', async () => {
    const mockComments = [
      {
        id: 'c1',
        text: 'First',
        createdAt: new Date('2024-01-01'),
        user: { id: 'u1', email: 'a@b.com' },
      },
      {
        id: 'c2',
        text: 'Second',
        createdAt: new Date('2024-01-02'),
        user: { id: 'u2', email: 'c@d.com' },
      },
    ]
    vi.mocked(prisma.comment.findMany).mockResolvedValue(mockComments as never)

    const result = await listComments('p1', 't1')

    expect(prisma.comment.findMany).toHaveBeenCalledWith({
      where: { translationId: 't1', deletedAt: null },
      orderBy: { createdAt: 'asc' },
      include: { user: { select: { id: true, email: true, name: true } } },
    })
    expect(result).toEqual(mockComments)
  })
})

describe('deleteComment', () => {
  const mockComment = {
    id: 'c1',
    translationId: 't1',
    userId: 'u1',
    text: 'Hello',
    createdAt: new Date(),
  }

  it('allows comment author to delete their own comment', async () => {
    vi.mocked(prisma.comment.findFirst).mockResolvedValue(mockComment as never)
    vi.mocked(prisma.comment.update).mockResolvedValue({
      ...mockComment,
      deletedAt: new Date(),
    } as never)
    await expect(deleteComment('p1', 't1', 'c1', 'u1', 'TRANSLATOR')).resolves.toBeUndefined()
    expect(prisma.comment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'c1' },
        data: expect.objectContaining({ deletedAt: expect.any(Date) }),
      }),
    )
  })

  it('allows MAINTAINER to delete any comment', async () => {
    vi.mocked(prisma.comment.findFirst).mockResolvedValue(mockComment as never)
    vi.mocked(prisma.comment.update).mockResolvedValue({
      ...mockComment,
      deletedAt: new Date(),
    } as never)
    await expect(deleteComment('p1', 't1', 'c1', 'u2', 'MAINTAINER')).resolves.toBeUndefined()
  })

  it('throws 403 when non-author TRANSLATOR tries to delete', async () => {
    vi.mocked(prisma.comment.findFirst).mockResolvedValue(mockComment as never)
    await expect(deleteComment('p1', 't1', 'c1', 'u2', 'TRANSLATOR')).rejects.toMatchObject({
      statusCode: 403,
    })
  })

  it('throws 404 when comment not found', async () => {
    vi.mocked(prisma.comment.findFirst).mockResolvedValue(null)
    await expect(deleteComment('p1', 't1', 'missing', 'u1', 'ADMIN')).rejects.toMatchObject({
      statusCode: 404,
    })
  })
})

describe('cross-project isolation', () => {
  it('will not list the thread of a translation from another project', async () => {
    vi.mocked(prisma.translation.findFirst).mockResolvedValue(null)
    await expect(listComments('p1', 't-of-p2')).rejects.toMatchObject({ statusCode: 404 })
    expect(prisma.translation.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 't-of-p2', key: { projectId: 'p1' } } }),
    )
    expect(prisma.comment.findMany).not.toHaveBeenCalled()
  })

  it('will not comment on a translation from another project', async () => {
    vi.mocked(prisma.translation.findFirst).mockResolvedValue(null)
    await expect(addComment('t-of-p2', 'u1', 'hi', 'p1')).rejects.toMatchObject({ statusCode: 404 })
    expect(prisma.comment.create).not.toHaveBeenCalled()
  })

  it('will not reply under a comment from another thread', async () => {
    vi.mocked(prisma.comment.findFirst).mockResolvedValue(null)
    await expect(addComment('t1', 'u1', 'hi', 'p1', 'c-elsewhere')).rejects.toMatchObject({ statusCode: 404 })
    expect(prisma.comment.create).not.toHaveBeenCalled()
  })

  it('finds a comment to delete only through the project and translation in the URL', async () => {
    vi.mocked(prisma.comment.findFirst).mockResolvedValue(null)
    await expect(deleteComment('p1', 't1', 'c-of-p2', 'u1', 'ADMIN')).rejects.toMatchObject({ statusCode: 404 })
    expect(prisma.comment.findFirst).toHaveBeenCalledWith({
      where: { id: 'c-of-p2', translationId: 't1', translation: { key: { projectId: 'p1' } } },
    })
    expect(prisma.comment.update).not.toHaveBeenCalled()
  })
})
