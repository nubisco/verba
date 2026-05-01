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
