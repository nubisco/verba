import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../prisma.js', () => ({
  prisma: {
    namespace: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}))

import { prisma } from '../prisma.js'
import {
  listNamespaces,
  getNamespace,
  createNamespace,
  updateNamespace,
  deleteNamespace,
} from '../services/namespace.service.js'

const mockNs = { id: 'ns1', name: 'Common', slug: 'common', projectId: 'p1' }

beforeEach(() => vi.clearAllMocks())

describe('listNamespaces', () => {
  it('returns namespaces for project', async () => {
    vi.mocked(prisma.namespace.findMany).mockResolvedValue([mockNs])
    expect(await listNamespaces('p1')).toEqual([mockNs])
  })
})

describe('getNamespace', () => {
  it('returns namespace when found', async () => {
    vi.mocked(prisma.namespace.findFirst).mockResolvedValue(mockNs)
    expect(await getNamespace('p1', 'ns1')).toEqual(mockNs)
  })

  it('throws 404 when not found', async () => {
    vi.mocked(prisma.namespace.findFirst).mockResolvedValue(null)
    await expect(getNamespace('p1', 'missing')).rejects.toMatchObject({
      statusCode: 404,
    })
  })
})

describe('createNamespace', () => {
  it('creates namespace', async () => {
    vi.mocked(prisma.namespace.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.namespace.create).mockResolvedValue(mockNs)
    expect(await createNamespace('p1', { name: 'Common', slug: 'common' })).toEqual(mockNs)
  })

  it('throws 409 when slug already exists', async () => {
    vi.mocked(prisma.namespace.findUnique).mockResolvedValue(mockNs)
    await expect(createNamespace('p1', { name: 'Common', slug: 'common' })).rejects.toMatchObject({
      statusCode: 409,
    })
  })
})

describe('updateNamespace', () => {
  it('updates namespace', async () => {
    vi.mocked(prisma.namespace.findFirst).mockResolvedValue(mockNs)
    vi.mocked(prisma.namespace.update).mockResolvedValue({
      ...mockNs,
      name: 'Updated',
    })
    expect((await updateNamespace('p1', 'ns1', { name: 'Updated' })).name).toBe('Updated')
  })

  it('throws 409 on slug conflict with another namespace', async () => {
    vi.mocked(prisma.namespace.findFirst)
      .mockResolvedValueOnce(mockNs) // getNamespace ok
      .mockResolvedValueOnce({ ...mockNs, id: 'ns2' }) // slug conflict
    await expect(updateNamespace('p1', 'ns1', { slug: 'common' })).rejects.toMatchObject({
      statusCode: 409,
    })
  })
})

describe('deleteNamespace', () => {
  it('deletes namespace', async () => {
    vi.mocked(prisma.namespace.findFirst).mockResolvedValue(mockNs)
    vi.mocked(prisma.namespace.delete).mockResolvedValue(mockNs)
    await expect(deleteNamespace('p1', 'ns1')).resolves.toBeUndefined()
  })

  it('throws 404 when not found', async () => {
    vi.mocked(prisma.namespace.findFirst).mockResolvedValue(null)
    await expect(deleteNamespace('p1', 'missing')).rejects.toMatchObject({
      statusCode: 404,
    })
  })
})
