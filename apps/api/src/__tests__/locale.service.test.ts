import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../prisma.js', () => ({
  prisma: {
    locale: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    translation: { count: vi.fn() },
  },
}))

import { prisma } from '../prisma.js'
import { listLocales, getLocale, createLocale, updateLocale, deleteLocale } from '../services/locale.service.js'

const mockLocale = {
  id: 'l1',
  code: 'en',
  name: 'English',
  projectId: 'p1',
  isEnabled: true,
}

beforeEach(() => vi.clearAllMocks())

describe('listLocales', () => {
  it('returns locales for project', async () => {
    vi.mocked(prisma.locale.findMany).mockResolvedValue([mockLocale])
    const result = await listLocales('p1')
    expect(result).toEqual([mockLocale])
  })
})

describe('getLocale', () => {
  it('returns locale when found', async () => {
    vi.mocked(prisma.locale.findFirst).mockResolvedValue(mockLocale)
    expect(await getLocale('p1', 'l1')).toEqual(mockLocale)
  })

  it('throws 404 when not found', async () => {
    vi.mocked(prisma.locale.findFirst).mockResolvedValue(null)
    await expect(getLocale('p1', 'missing')).rejects.toMatchObject({
      statusCode: 404,
    })
  })
})

describe('createLocale', () => {
  it('creates locale', async () => {
    vi.mocked(prisma.locale.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.locale.create).mockResolvedValue(mockLocale)
    expect(await createLocale('p1', { code: 'en', name: 'English' })).toEqual(mockLocale)
  })

  it('throws 409 when code already exists', async () => {
    vi.mocked(prisma.locale.findUnique).mockResolvedValue(mockLocale)
    await expect(createLocale('p1', { code: 'en', name: 'English' })).rejects.toMatchObject({
      statusCode: 409,
    })
  })
})

describe('updateLocale', () => {
  it('updates locale', async () => {
    vi.mocked(prisma.locale.findFirst).mockResolvedValue(mockLocale)
    vi.mocked(prisma.locale.findFirst).mockResolvedValueOnce(mockLocale) // getLocale
    vi.mocked(prisma.locale.update).mockResolvedValue({
      ...mockLocale,
      name: 'EN',
    })
    const result = await updateLocale('p1', 'l1', { name: 'EN' })
    expect(result.name).toBe('EN')
  })

  it('throws 409 when updating code to one that already exists', async () => {
    vi.mocked(prisma.locale.findFirst)
      .mockResolvedValueOnce(mockLocale) // getLocale passes
      .mockResolvedValueOnce({ ...mockLocale, id: 'l2' }) // conflict check finds another
    await expect(updateLocale('p1', 'l1', { code: 'en' })).rejects.toMatchObject({
      statusCode: 409,
    })
  })
})

describe('deleteLocale', () => {
  it('deletes locale when no translations exist', async () => {
    vi.mocked(prisma.locale.findFirst).mockResolvedValue(mockLocale)
    vi.mocked(prisma.translation.count).mockResolvedValue(0)
    vi.mocked(prisma.locale.delete).mockResolvedValue(mockLocale)
    await expect(deleteLocale('p1', 'l1')).resolves.toBeUndefined()
  })

  it('throws 409 when translations exist', async () => {
    vi.mocked(prisma.locale.findFirst).mockResolvedValue(mockLocale)
    vi.mocked(prisma.translation.count).mockResolvedValue(3)
    await expect(deleteLocale('p1', 'l1')).rejects.toMatchObject({
      statusCode: 409,
    })
  })
})
