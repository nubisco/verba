import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../prisma.js', () => ({
  prisma: {
    locale: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    translation: {
      findMany: vi.fn(),
    },
    key: { findMany: vi.fn() },
    namespace: { findMany: vi.fn() },
  },
}))

import { unzipSync, strFromU8 } from 'fflate'
import * as XLSX from 'xlsx'
import { prisma } from '../prisma.js'
import { exportLocale, exportTranslations } from '../services/export.service.js'

// Exports read keys, namespaces and locales flat, beside the translations
// (key-index.service.ts). These are the keys the cases below name.
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(prisma.key.findMany).mockResolvedValue(
    [
      ['k1', 'greeting'],
      ['k2', 'farewell'],
      ['k3', 'z_key'],
      ['k4', 'a_key'],
      ['k5', 'approved_key'],
    ].map(([id, name]) => ({ id, name, namespaceId: 'ns1' })) as never,
  )
  vi.mocked(prisma.namespace.findMany).mockResolvedValue([])
  vi.mocked(prisma.locale.findMany).mockResolvedValue([{ id: 'l1', code: 'en' }] as never)
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

// The files are built with SheetJS and fflate, which run on Node and on a
// Worker alike, so read them back with the same libraries.
describe('exportTranslations files', () => {
  const rows = [
    { keyId: 'k-title', localeId: 'l-en', text: 'Hello', status: 'APPROVED' },
    { keyId: 'k-title', localeId: 'l-pt', text: 'Olá', status: 'TODO' },
    { keyId: 'k-bye', localeId: 'l-en', text: 'Bye', status: 'APPROVED' },
  ]

  beforeEach(() => {
    vi.mocked(prisma.translation.findMany).mockResolvedValue(rows as never)
    vi.mocked(prisma.key.findMany).mockResolvedValue([
      { id: 'k-title', name: 'title', namespaceId: 'ns-app' },
      { id: 'k-bye', name: 'bye', namespaceId: 'ns-app' },
    ] as never)
    vi.mocked(prisma.namespace.findMany).mockResolvedValue([{ id: 'ns-app', slug: 'app' }] as never)
    vi.mocked(prisma.locale.findMany).mockResolvedValue([
      { id: 'l-en', code: 'en' },
      { id: 'l-pt', code: 'pt-PT' },
    ] as never)
  })

  it('writes one XLSX sheet per locale', async () => {
    const result = await exportTranslations('p1', { format: 'xlsx' })
    expect(result.filename).toBe('translations.xlsx')
    const book = XLSX.read(result.data, { type: 'buffer' })
    expect(book.SheetNames).toEqual(['en', 'pt-PT'])
    expect(XLSX.utils.sheet_to_json(book.Sheets['en'], { header: 1 })).toEqual([
      ['namespace', 'key', 'text', 'status'],
      ['app', 'title', 'Hello', 'APPROVED'],
      ['app', 'bye', 'Bye', 'APPROVED'],
    ])
  })

  it('writes a workbook even when nothing matches', async () => {
    vi.mocked(prisma.translation.findMany).mockResolvedValue([])
    const result = await exportTranslations('p1', { format: 'xlsx' })
    expect(XLSX.read(result.data, { type: 'buffer' }).SheetNames).toEqual(['translations'])
  })

  it('zips one JSON file per locale and namespace, keys sorted', async () => {
    const result = await exportTranslations('p1', { format: 'json', splitByNamespace: true })
    expect(result.contentType).toBe('application/zip')
    const files = unzipSync(new Uint8Array(result.data as Buffer))
    expect(Object.keys(files).sort()).toEqual(['en/app.json', 'pt-PT/app.json'])
    expect(strFromU8(files['en/app.json'])).toBe(JSON.stringify({ bye: 'Bye', title: 'Hello' }, null, 2))
  })
})
