import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../prisma.js', () => ({
  prisma: {
    locale: {
      findUnique: vi.fn(),
    },
    translation: {
      findMany: vi.fn(),
    },
  },
}))

import { prisma } from '../prisma.js'
import { exportLocale } from '../services/export.service.js'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('exportLocale', () => {
  it('returns 404 when locale not found', async () => {
    vi.mocked(prisma.locale.findUnique).mockResolvedValue(null)
    await expect(exportLocale('p1', 'en')).rejects.toMatchObject({
      statusCode: 404,
    })
  })

  it('returns only APPROVED translations as flat object', async () => {
    vi.mocked(prisma.locale.findUnique).mockResolvedValue({
      id: 'l1',
      projectId: 'p1',
      code: 'en',
      name: 'English',
      isEnabled: true,
    })
    vi.mocked(prisma.translation.findMany).mockResolvedValue([
      {
        id: 't1',
        keyId: 'k1',
        localeId: 'l1',
        text: 'Hello',
        status: 'APPROVED',
        version: 1,
        updatedById: null,
        updatedAt: new Date(),
        key: {
          id: 'k1',
          name: 'greeting',
          projectId: 'p1',
          namespaceId: 'ns1',
          description: null,
        },
      },
      {
        id: 't2',
        keyId: 'k2',
        localeId: 'l1',
        text: 'Bye',
        status: 'APPROVED',
        version: 1,
        updatedById: null,
        updatedAt: new Date(),
        key: {
          id: 'k2',
          name: 'farewell',
          projectId: 'p1',
          namespaceId: 'ns1',
          description: null,
        },
      },
    ] as Parameters<typeof prisma.translation.findMany>[0] extends {
      where: infer W
    }
      ? W extends object
        ? {
            id: string
            keyId: string
            localeId: string
            text: string
            status: string
            version: number
            updatedById: string | null
            updatedAt: Date
            key: {
              id: string
              name: string
              projectId: string
              namespaceId: string
              description: string | null
            }
          }[]
        : never
      : never)

    const result = await exportLocale('p1', 'en')
    expect(result).toEqual({ farewell: 'Bye', greeting: 'Hello' })
  })

  it('returns keys sorted alphabetically', async () => {
    vi.mocked(prisma.locale.findUnique).mockResolvedValue({
      id: 'l1',
      projectId: 'p1',
      code: 'en',
      name: 'English',
      isEnabled: true,
    })
    vi.mocked(prisma.translation.findMany).mockResolvedValue([
      {
        id: 't3',
        keyId: 'k3',
        localeId: 'l1',
        text: 'Z text',
        status: 'APPROVED',
        version: 1,
        updatedById: null,
        updatedAt: new Date(),
        key: {
          id: 'k3',
          name: 'z_key',
          projectId: 'p1',
          namespaceId: 'ns1',
          description: null,
        },
      },
      {
        id: 't4',
        keyId: 'k4',
        localeId: 'l1',
        text: 'A text',
        status: 'APPROVED',
        version: 1,
        updatedById: null,
        updatedAt: new Date(),
        key: {
          id: 'k4',
          name: 'a_key',
          projectId: 'p1',
          namespaceId: 'ns1',
          description: null,
        },
      },
    ] as Parameters<typeof prisma.translation.findMany>[0] extends {
      where: infer W
    }
      ? W extends object
        ? {
            id: string
            keyId: string
            localeId: string
            text: string
            status: string
            version: number
            updatedById: string | null
            updatedAt: Date
            key: {
              id: string
              name: string
              projectId: string
              namespaceId: string
              description: string | null
            }
          }[]
        : never
      : never)

    const result = await exportLocale('p1', 'en')
    expect(Object.keys(result)).toEqual(['a_key', 'z_key'])
  })

  it('filters out non-APPROVED translations', async () => {
    vi.mocked(prisma.locale.findUnique).mockResolvedValue({
      id: 'l1',
      projectId: 'p1',
      code: 'en',
      name: 'English',
      isEnabled: true,
    })
    vi.mocked(prisma.translation.findMany).mockResolvedValue([
      {
        id: 't5',
        keyId: 'k5',
        localeId: 'l1',
        text: 'Approved',
        status: 'APPROVED',
        version: 1,
        updatedById: null,
        updatedAt: new Date(),
        key: {
          id: 'k5',
          name: 'approved_key',
          projectId: 'p1',
          namespaceId: 'ns1',
          description: null,
        },
      },
    ] as Parameters<typeof prisma.translation.findMany>[0] extends {
      where: infer W
    }
      ? W extends object
        ? {
            id: string
            keyId: string
            localeId: string
            text: string
            status: string
            version: number
            updatedById: string | null
            updatedAt: Date
            key: {
              id: string
              name: string
              projectId: string
              namespaceId: string
              description: string | null
            }
          }[]
        : never
      : never)

    const result = await exportLocale('p1', 'en')
    expect(Object.keys(result)).toHaveLength(1)
    expect(result['approved_key']).toBe('Approved')
    expect(vi.mocked(prisma.translation.findMany)).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'APPROVED' }),
      }),
    )
  })
})
