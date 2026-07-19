import { describe, it, expect, vi } from 'vitest'

// isXliffUpload is pure; stub prisma + downstream so importing the module is cheap.
vi.mock('../prisma.js', () => ({ prisma: {} }))
vi.mock('../services/translation.service.js', () => ({ upsertTranslation: vi.fn() }))
vi.mock('../services/import-run.service.js', () => ({ updateImportRun: vi.fn() }))
vi.mock('../events.js', () => ({ emit: vi.fn() }))

import { isXliffUpload } from '../services/xliff.service.js'

const XLIFF = Buffer.from('<?xml version="1.0" encoding="UTF-8"?>\n<xliff version="1.2"><file original="a"/></xliff>')

describe('isXliffUpload', () => {
  it('detects by .xliff / .xlf extension', () => {
    expect(isXliffUpload('pt-PT.xliff', 'application/octet-stream', Buffer.from('x'))).toBe(true)
    expect(isXliffUpload('strings.xlf', undefined, Buffer.from('x'))).toBe(true)
  })

  it('detects by mimetype', () => {
    expect(isXliffUpload('blob', 'application/x-xliff+xml', Buffer.from('x'))).toBe(true)
  })

  it('detects by content sniff of <xliff', () => {
    expect(isXliffUpload('unknown.bin', 'application/octet-stream', XLIFF)).toBe(true)
  })

  it('does not misfire on CSV/JSON/XLSX', () => {
    expect(isXliffUpload('data.csv', 'text/csv', Buffer.from('key,en\na,b'))).toBe(false)
    expect(isXliffUpload('data.json', 'application/json', Buffer.from('{"a":"b"}'))).toBe(false)
    expect(isXliffUpload('data.xlsx', 'application/vnd.ms-excel', Buffer.from('PK'))).toBe(false)
  })
})
