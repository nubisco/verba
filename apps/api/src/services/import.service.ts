import * as XLSX from 'xlsx'
import { prisma } from '../prisma.js'
import type { ImportMapping } from '../schemas/import.schema.js'
import { upsertTranslation } from './translation.service.js'
import { Role } from '../types.js'
import { updateImportRun } from './import-run.service.js'
import { emit } from '../events.js'

export interface ImportRow {
  keyName: string
  namespaceName?: string
  translations: Record<string, string>
}

export interface PreviewRow {
  keyName: string
  namespaceName?: string
  status: 'create' | 'update' | 'skip'
  localeChanges: {
    localeCode: string
    oldText: string | null
    newText: string
  }[]
}

export interface PreviewResult {
  created: number
  updated: number
  skipped: number
  rows: PreviewRow[]
}

export interface Stats {
  created: number
  updated: number
  skipped: number
  errors: { row: number; message: string }[]
}

export function parseFile(buffer: Buffer, mimeType: string, mapping: ImportMapping): ImportRow[] {
  const str = buffer.slice(0, 10).toString('utf-8').trimStart()
  if (mimeType === 'application/json' || str.startsWith('{') || str.startsWith('[')) {
    return parseJsonFile(buffer, mapping)
  }
  return parseTabularFile(buffer, mapping)
}

function parseJsonFile(buffer: Buffer, mapping: ImportMapping): ImportRow[] {
  const raw = JSON.parse(buffer.toString('utf-8'))

  // Multi-locale: { "en": { "ns.key": "value" }, "fr": { ... } }
  const firstValue = Object.values(raw)[0]
  const isMultiLocale = typeof firstValue === 'object' && firstValue !== null && !Array.isArray(firstValue)

  const keyMap = new Map<string, ImportRow>()

  function addEntry(localeCode: string, flatKey: string, text: string) {
    const dotIdx = flatKey.indexOf('.')
    let keyName: string
    let namespaceName: string | undefined
    if (dotIdx !== -1) {
      namespaceName = flatKey.substring(0, dotIdx)
      keyName = flatKey.substring(dotIdx + 1)
    } else {
      keyName = flatKey
    }
    const rowKey = `${namespaceName ?? ''}::${keyName}`
    if (!keyMap.has(rowKey)) keyMap.set(rowKey, { keyName, namespaceName, translations: {} })
    keyMap.get(rowKey)!.translations[localeCode] = text
  }

  if (isMultiLocale) {
    const localeData = raw as Record<string, Record<string, string>>
    for (const [localeCode, translations] of Object.entries(localeData)) {
      for (const [flatKey, text] of Object.entries(translations)) {
        addEntry(localeCode, flatKey, String(text))
      }
    }
  } else {
    // Single-locale: { "ns.key": "value" }
    // Determine locale code from first entry in localeColumns, or throw
    const localeCode = Object.keys(mapping.localeColumns)[0]
    if (!localeCode)
      throw Object.assign(new Error('For single-locale JSON, specify the target locale in the mapping'), {
        statusCode: 400,
      })
    for (const [flatKey, text] of Object.entries(raw as Record<string, string>)) {
      addEntry(localeCode, flatKey, String(text))
    }
  }

  return Array.from(keyMap.values())
}

/**
 * Spreadsheet containers (xlsx and ods are zip archives, legacy xls is OLE2)
 * carry their own encoding, so SheetJS reads them as bytes. Anything else is a
 * text format such as CSV, and SheetJS reads raw text bytes as a single-byte
 * codepage, which turns every non-ASCII character of a UTF-8 file into mojibake
 * ("Português" became "PortuguÃªs"). So text is decoded as UTF-8 here first,
 * judged by content rather than MIME type, because Windows browsers upload
 * .csv as application/vnd.ms-excel. A file that is not valid UTF-8 (an older
 * Windows-1252 Excel export) falls back to the codepage read. `raw` keeps CSV
 * values as written, so a key like 007 stays 007 instead of becoming 7.
 */
function readWorkbook(buffer: Buffer): XLSX.WorkBook {
  const isZip = buffer[0] === 0x50 && buffer[1] === 0x4b
  const isOle2 = buffer.subarray(0, 4).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0]))
  if (isZip || isOle2) return XLSX.read(buffer, { type: 'buffer' })

  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(buffer)
  } catch {
    return XLSX.read(buffer, { type: 'buffer', raw: true })
  }
  return XLSX.read(text, { type: 'string', raw: true })
}

function parseTabularFile(buffer: Buffer, mapping: ImportMapping): ImportRow[] {
  const workbook = readWorkbook(buffer)
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  // raw: false returns every cell as its displayed text, so a numeric cell
  // arrives as "42" rather than a number that .trim() below would throw on.
  const data = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, {
    defval: '',
    raw: false,
  })

  const rows: ImportRow[] = []
  for (const row of data) {
    const keyName = row[mapping.keyColumn]?.trim()
    if (!keyName) continue

    const namespaceName = mapping.namespaceColumn ? row[mapping.namespaceColumn]?.trim() : undefined

    const translations: Record<string, string> = {}
    for (const [localeCode, columnName] of Object.entries(mapping.localeColumns)) {
      const text = row[columnName]?.trim()
      if (text !== undefined) {
        translations[localeCode] = text
      }
    }

    rows.push({ keyName, namespaceName, translations })
  }
  return rows
}

export async function previewImport(
  projectId: string,
  rows: ImportRow[],
  mapping: ImportMapping,
): Promise<PreviewResult> {
  const result: PreviewResult = { created: 0, updated: 0, skipped: 0, rows: [] }

  const localeCodes = Object.keys(mapping.localeColumns)
  const locales = (await prisma.locale.findMany({
    where: { projectId, code: { in: localeCodes } },
  })) as { id: string; code: string }[]
  const localeMap = new Map(locales.map((l) => [l.code, l]))

  for (const row of rows) {
    if (!row.keyName) {
      result.skipped++
      result.rows.push({ keyName: '', status: 'skip', localeChanges: [] })
      continue
    }

    const nsName = row.namespaceName || 'default'
    const existingKey = (await prisma.key.findFirst({
      where: {
        projectId,
        name: row.keyName,
        namespace: { slug: nsName },
      },
    })) as { id: string } | null

    const localeChanges: PreviewRow['localeChanges'] = []
    for (const [localeCode, newText] of Object.entries(row.translations)) {
      const locale = localeMap.get(localeCode)
      if (!locale) continue

      let oldText: string | null = null
      if (existingKey) {
        const existing = await prisma.translation.findUnique({
          where: {
            keyId_localeId: { keyId: existingKey.id, localeId: locale.id },
          },
        })
        oldText = existing?.text ?? null
      }
      localeChanges.push({ localeCode, oldText, newText })
    }

    if (!existingKey) {
      result.created++
      result.rows.push({
        keyName: row.keyName,
        namespaceName: row.namespaceName,
        status: 'create',
        localeChanges,
      })
    } else {
      result.updated++
      result.rows.push({
        keyName: row.keyName,
        namespaceName: row.namespaceName,
        status: 'update',
        localeChanges,
      })
    }
  }

  return result
}

export async function applyImport(
  projectId: string,
  rows: ImportRow[],
  mapping: ImportMapping,
  userId: string | undefined,
  importRunId: string,
): Promise<Stats> {
  const stats: Stats = { created: 0, updated: 0, skipped: 0, errors: [] }

  const localeCodes = Object.keys(mapping.localeColumns)
  const locales = (await prisma.locale.findMany({
    where: { projectId, code: { in: localeCodes } },
  })) as { id: string; code: string }[]
  const localeMap = new Map(locales.map((l) => [l.code, l]))

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    if (!row.keyName) {
      stats.skipped++
      continue
    }

    try {
      const nsName = row.namespaceName || 'default'
      const nsSlug = nsName.toLowerCase().replace(/[^a-z0-9]+/g, '-')

      // Find or create namespace
      let namespace = await prisma.namespace.findUnique({
        where: { projectId_slug: { projectId, slug: nsSlug } },
      })
      if (!namespace) {
        namespace = await prisma.namespace.create({
          data: { projectId, name: nsName, slug: nsSlug },
        })
      }

      // Find or create key
      let key = (await prisma.key.findUnique({
        where: {
          namespaceId_name: { namespaceId: namespace.id, name: row.keyName },
        },
      })) as { id: string } | null
      if (!key) {
        key = (await prisma.key.create({
          data: { projectId, namespaceId: namespace.id, name: row.keyName },
        })) as { id: string }
        stats.created++
      } else {
        stats.updated++
      }

      // Upsert translations
      for (const [localeCode, text] of Object.entries(row.translations)) {
        const locale = localeMap.get(localeCode)
        if (!locale) {
          stats.errors.push({
            row: i + 2,
            message: `Locale "${localeCode}" not found in project`,
          })
          continue
        }
        // Imports run behind the MAINTAINER role (routes/import.ts).
        await upsertTranslation(key.id, locale.id, { text }, userId, Role.MAINTAINER)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      stats.errors.push({ row: i + 2, message })
    }
  }

  await updateImportRun(
    importRunId,
    'COMPLETED',
    { created: stats.created, updated: stats.updated, skipped: stats.skipped },
    stats.errors,
  )
  emit({
    type: 'import.applied',
    projectId,
    created: stats.created,
    updated: stats.updated,
  })

  return stats
}
