import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../prisma.js', () => ({
  prisma: {
    key: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    locale: { findMany: vi.fn() },
    translation: { createMany: vi.fn(), updateMany: vi.fn() },
    auditLog: { create: vi.fn() },
  },
}))

vi.mock('../events.js', () => ({ emit: vi.fn() }))

import { prisma } from '../prisma.js'
import { emit } from '../events.js'
import { listKeys, getKey, createKey, updateKey, deleteKey, restoreKey } from '../services/key.service.js'

const mockKey = {
  id: 'k1',
  name: 'greeting',
  projectId: 'p1',
  namespaceId: 'ns1',
  namespaceSlug: null,
  fullKey: 'greeting',
  description: null,
  deletedAt: null,
}

beforeEach(() => vi.clearAllMocks())

describe('listKeys', () => {
  it('returns paginated keys for project', async () => {
    vi.mocked(prisma.key.findMany).mockResolvedValue([mockKey])
    vi.mocked(prisma.key.count).mockResolvedValue(1)
    const result = await listKeys('p1', {
      page: 1,
      limit: 20,
      includeTranslations: false,
    })
    expect(result).toEqual({ items: [mockKey], total: 1, page: 1, limit: 20 })
    expect(prisma.key.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { projectId: 'p1', deletedAt: null } }),
    )
  })

  it('filters by namespaceId when provided', async () => {
    vi.mocked(prisma.key.findMany).mockResolvedValue([mockKey])
    vi.mocked(prisma.key.count).mockResolvedValue(1)
    await listKeys('p1', {
      namespaceId: 'ns1',
      page: 1,
      limit: 20,
      includeTranslations: false,
    })
    expect(prisma.key.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { projectId: 'p1', namespaceId: 'ns1', deletedAt: null },
      }),
    )
  })

  it('searches by key name only when search text has fewer than 3 chars', async () => {
    vi.mocked(prisma.key.findMany).mockResolvedValue([mockKey])
    vi.mocked(prisma.key.count).mockResolvedValue(1)

    await listKeys('p1', {
      search: 'lo',
      page: 1,
      limit: 20,
      includeTranslations: false,
    })

    expect(prisma.key.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          projectId: 'p1',
          deletedAt: null,
          name: { contains: 'lo' },
        },
      }),
    )
  })

  it('searches by key name and translation text when search text has at least 3 chars', async () => {
    vi.mocked(prisma.key.findMany).mockResolvedValue([mockKey])
    vi.mocked(prisma.key.count).mockResolvedValue(1)

    await listKeys('p1', {
      search: 'entrar',
      page: 1,
      limit: 20,
      includeTranslations: false,
    })

    expect(prisma.key.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          projectId: 'p1',
          deletedAt: null,
          OR: [
            { name: { contains: 'entrar' } },
            {
              translations: {
                some: {
                  deletedAt: null,
                  text: { contains: 'entrar' },
                },
              },
            },
          ],
        },
      }),
    )
  })
})

describe('getKey', () => {
  it('returns key when found', async () => {
    vi.mocked(prisma.key.findFirst).mockResolvedValue(mockKey)
    const result = await getKey('p1', 'k1')
    expect(result).toEqual(mockKey)
  })

  it('throws 404 when not found', async () => {
    vi.mocked(prisma.key.findFirst).mockResolvedValue(null)
    await expect(getKey('p1', 'missing')).rejects.toMatchObject({
      statusCode: 404,
    })
  })
})

describe('createKey', () => {
  it('creates key and emits event', async () => {
    vi.mocked(prisma.key.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.key.create).mockResolvedValue({
      ...mockKey,
      namespaceSlug: undefined,
      fullKey: undefined,
    } as never)
    vi.mocked(prisma.key.findUniqueOrThrow).mockResolvedValue({
      ...mockKey,
      namespace: null,
    } as never)
    vi.mocked(prisma.locale.findMany).mockResolvedValue([])
    vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never)
    const result = await createKey('p1', {
      name: 'greeting',
      namespaceId: 'ns1',
    })
    expect(result).toMatchObject({
      ...mockKey,
      namespace: null,
    })
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({ type: 'key.created', keyId: 'k1' }))
  })

  it('throws 409 when key name already exists in namespace', async () => {
    vi.mocked(prisma.key.findUnique).mockResolvedValue(mockKey)
    await expect(createKey('p1', { name: 'greeting', namespaceId: 'ns1' })).rejects.toMatchObject({
      statusCode: 409,
    })
  })
})

describe('updateKey', () => {
  it('updates key', async () => {
    vi.mocked(prisma.key.findFirst).mockResolvedValue(mockKey)
    vi.mocked(prisma.key.update).mockResolvedValue({
      ...mockKey,
      description: 'updated',
    })
    const result = await updateKey('p1', 'k1', { description: 'updated' })
    expect(result.description).toBe('updated')
  })

  it('throws 404 when key does not exist', async () => {
    vi.mocked(prisma.key.findFirst).mockResolvedValue(null)
    await expect(updateKey('p1', 'missing', {})).rejects.toMatchObject({
      statusCode: 404,
    })
  })
})

describe('deleteKey', () => {
  it('soft-deletes key and its translations', async () => {
    vi.mocked(prisma.key.findFirst).mockResolvedValue(mockKey)
    vi.mocked(prisma.key.update).mockResolvedValue({
      ...mockKey,
      deletedAt: new Date(),
    } as never)
    vi.mocked(prisma.translation.updateMany).mockResolvedValue({ count: 0 })
    await expect(deleteKey('p1', 'k1')).resolves.toBeUndefined()
    expect(prisma.key.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'k1' },
        data: expect.objectContaining({ deletedAt: expect.any(Date) }),
      }),
    )
    expect(prisma.translation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { keyId: 'k1' },
        data: expect.objectContaining({ deletedAt: expect.any(Date) }),
      }),
    )
  })

  it('throws 404 when key does not exist', async () => {
    vi.mocked(prisma.key.findFirst).mockResolvedValue(null)
    await expect(deleteKey('p1', 'missing')).rejects.toMatchObject({
      statusCode: 404,
    })
  })
})

describe('restoreKey', () => {
  it('restores a soft-deleted key', async () => {
    vi.mocked(prisma.key.findFirst)
      .mockResolvedValueOnce(mockKey) // findFirst for the key
      .mockResolvedValueOnce(null) // findFirst for conflict check
      .mockResolvedValueOnce(mockKey) // findFirst after restore
    vi.mocked(prisma.key.update).mockResolvedValue(mockKey)
    vi.mocked(prisma.translation.updateMany).mockResolvedValue({ count: 0 })
    const result = await restoreKey('p1', 'k1')
    expect(prisma.key.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'k1' },
        data: { deletedAt: null },
      }),
    )
    expect(result).toEqual(mockKey)
  })

  it('throws 404 when key does not exist', async () => {
    vi.mocked(prisma.key.findFirst).mockResolvedValue(null)
    await expect(restoreKey('p1', 'missing')).rejects.toMatchObject({
      statusCode: 404,
    })
  })

  it('throws 409 when a non-deleted key with same name exists', async () => {
    vi.mocked(prisma.key.findFirst)
      .mockResolvedValueOnce(mockKey) // the deleted key
      .mockResolvedValueOnce(mockKey) // conflict key
    await expect(restoreKey('p1', 'k1')).rejects.toMatchObject({
      statusCode: 409,
    })
  })
})
