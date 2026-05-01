import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../prisma.js', () => ({
  prisma: {
    comment: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    translation: {
      findUnique: vi.fn(),
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
  vi.mocked(prisma.translation.findUnique).mockResolvedValue({
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

    const result = await listComments('t1')

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
    vi.mocked(prisma.comment.findUnique).mockResolvedValue(mockComment as never)
    vi.mocked(prisma.comment.update).mockResolvedValue({
      ...mockComment,
      deletedAt: new Date(),
    } as never)
    await expect(deleteComment('c1', 'u1', 'TRANSLATOR')).resolves.toBeUndefined()
    expect(prisma.comment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'c1' },
        data: expect.objectContaining({ deletedAt: expect.any(Date) }),
      }),
    )
  })

  it('allows MAINTAINER to delete any comment', async () => {
    vi.mocked(prisma.comment.findUnique).mockResolvedValue(mockComment as never)
    vi.mocked(prisma.comment.update).mockResolvedValue({
      ...mockComment,
      deletedAt: new Date(),
    } as never)
    await expect(deleteComment('c1', 'u2', 'MAINTAINER')).resolves.toBeUndefined()
  })

  it('throws 403 when non-author TRANSLATOR tries to delete', async () => {
    vi.mocked(prisma.comment.findUnique).mockResolvedValue(mockComment as never)
    await expect(deleteComment('c1', 'u2', 'TRANSLATOR')).rejects.toMatchObject({
      statusCode: 403,
    })
  })

  it('throws 404 when comment not found', async () => {
    vi.mocked(prisma.comment.findUnique).mockResolvedValue(null)
    await expect(deleteComment('missing', 'u1', 'ADMIN')).rejects.toMatchObject({
      statusCode: 404,
    })
  })
})
