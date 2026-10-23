import { describe, it, expect, vi } from 'vitest'
import * as XLSX from 'xlsx'
import { parseFile } from '../services/import.service.js'
import type { ImportMapping } from '../schemas/import.schema.js'

vi.mock('../prisma.js', () => ({
  prisma: {},
}))

vi.mock('../services/translation.service.js', () => ({
  upsertTranslation: vi.fn(),
}))

vi.mock('../services/import-run.service.js', () => ({
  updateImportRun: vi.fn(),
}))

vi.mock('../events.js', () => ({
  emit: vi.fn(),
}))

function makeBuffer(rows: Record<string, string>[]): Buffer {
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.json_to_sheet(rows)
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }))
}

const mapping: ImportMapping = {
  keyColumn: 'key',
  namespaceColumn: 'ns',
  localeColumns: { en: 'en', de: 'de' },
}

describe('parseFile', () => {
  it('parses xlsx rows into ImportRow objects', () => {
    const buf = makeBuffer([
      { key: 'greeting', ns: 'common', en: 'Hello', de: 'Hallo' },
      { key: 'farewell', ns: 'common', en: 'Bye', de: 'Tschüss' },
    ])
    const rows = parseFile(buf, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', mapping)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({
      keyName: 'greeting',
      namespaceName: 'common',
      translations: { en: 'Hello', de: 'Hallo' },
    })
  })

  it('skips rows with empty key column', () => {
    const buf = makeBuffer([
      { key: '', ns: 'common', en: 'Hello', de: 'Hallo' },
      { key: 'farewell', ns: 'common', en: 'Bye', de: 'Tschüss' },
    ])
    const rows = parseFile(buf, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', mapping)
    expect(rows).toHaveLength(1)
    expect(rows[0].keyName).toBe('farewell')
  })

  it('handles missing namespace column gracefully', () => {
    const mappingNoNs: ImportMapping = {
      keyColumn: 'key',
      localeColumns: { en: 'en' },
    }
    const buf = makeBuffer([{ key: 'hello', en: 'Hello' }])
    const rows = parseFile(buf, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', mappingNoNs)
    expect(rows[0].namespaceName).toBeUndefined()
  })
})

describe('parseFile: text encodings and cell types', () => {
  // Translations are mostly non-ASCII, so a CSV that loses its encoding
  // corrupts exactly the data Verba exists to hold.
  const intl: ImportMapping = {
    keyColumn: 'key',
    localeColumns: { pt: 'Português', ja: '日本語', fr: 'fr' },
  }
  const csv = 'key,Português,日本語,fr\ngreeting,Olá,こんにちは,Ça va 👋\n'

  it('reads a UTF-8 CSV without mangling non-ASCII text, including in headers', () => {
    const rows = parseFile(Buffer.from(csv, 'utf-8'), 'text/csv', intl)
    expect(rows).toEqual([
      { keyName: 'greeting', namespaceName: undefined, translations: { pt: 'Olá', ja: 'こんにちは', fr: 'Ça va 👋' } },
    ])
  })

  it('ignores a UTF-8 byte order mark, so the first header still matches', () => {
    const rows = parseFile(
      Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(csv, 'utf-8')]),
      'text/csv',
      intl,
    )
    expect(rows[0].keyName).toBe('greeting')
    expect(rows[0].translations.pt).toBe('Olá')
  })

  it('decodes CSV by its content, not its MIME type (Windows browsers send application/vnd.ms-excel)', () => {
    const rows = parseFile(Buffer.from(csv, 'utf-8'), 'application/vnd.ms-excel', intl)
    expect(rows[0].translations.ja).toBe('こんにちは')
  })

  it('still reads a legacy single-byte CSV that is not valid UTF-8', () => {
    // "café" as Windows-1252, the encoding older Excel exports use.
    const cp1252 = Buffer.from([...Buffer.from('key,fr\nk,caf'), 0xe9, 0x0a])
    const rows = parseFile(cp1252, 'text/csv', { keyColumn: 'key', localeColumns: { fr: 'fr' } })
    expect(rows[0].translations.fr).toBe('café')
  })

  it('keeps CSV values as written, so keys like 007 are not turned into numbers', () => {
    const rows = parseFile(Buffer.from('key,en\n007,1.50\n'), 'text/csv', {
      keyColumn: 'key',
      localeColumns: { en: 'en' },
    })
    expect(rows[0]).toMatchObject({ keyName: '007', translations: { en: '1.50' } })
  })

  it('reads numeric spreadsheet cells as text instead of throwing', () => {
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ['key', 'en'],
        [42, 3],
      ]),
      'Sheet1',
    )
    const buf = Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }))
    const rows = parseFile(buf, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', {
      keyColumn: 'key',
      localeColumns: { en: 'en' },
    })
    expect(rows[0]).toMatchObject({ keyName: '42', translations: { en: '3' } })
  })

  it('reads non-ASCII text from an xlsx file', () => {
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ['key', 'Português'],
        ['k', 'Olá 👋'],
      ]),
      'Sheet1',
    )
    const buf = Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }))
    const rows = parseFile(buf, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', {
      keyColumn: 'key',
      localeColumns: { pt: 'Português' },
    })
    expect(rows[0].translations.pt).toBe('Olá 👋')
  })
})
