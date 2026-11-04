import {
  parseXliff,
  serializeXliff,
  unitKey,
  stateToStatus,
  resolveExportState,
  validatePlaceholders,
  type XliffDocument,
  type XliffOverlay,
} from '@nubisco/verba-shared'
import { prisma } from '../prisma.js'
import { assertKeysFit, assertLocalesFit } from './plan-limits.service.js'
import type { JobRow } from './import-job.service.js'
import { projectKeyIndex } from './key-index.service.js'

export interface XliffPreview {
  format: 'xliff'
  version: string
  sourceLanguage: string
  targetLanguage: string
  created: number
  updated: number
  skipped: number
  fileCount: number
  unitCount: number
  /** placeholder mismatches detected between source and target */
  warnings: { id: string; message: string }[]
  rows: {
    keyName: string
    namespaceName: string
    status: 'create' | 'update'
    localeChanges: { localeCode: string; oldText: string | null; newText: string }[]
  }[]
}

/** Detect whether an uploaded file is XLIFF (by extension or content sniff). */
export function isXliffUpload(filename: string | undefined, mimetype: string | undefined, buffer: Buffer): boolean {
  const name = (filename ?? '').toLowerCase()
  if (name.endsWith('.xliff') || name.endsWith('.xlf')) return true
  if (mimetype && /xliff/i.test(mimetype)) return true
  const head = buffer.subarray(0, 512).toString('utf-8')
  return /<xliff[\s>]/i.test(head)
}

/** Slug for a namespace derived from a file's `original` path. */
function slugifyOriginal(original: string): string {
  return (
    original
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'default'
  )
}

/** The single target language of an uploaded document (first file that has one). */
function targetLanguageOf(doc: XliffDocument): string {
  for (const f of doc.files) if (f.targetLanguage) return f.targetLanguage
  throw Object.assign(new Error('XLIFF file has no target-language'), { statusCode: 400 })
}

function sourceLanguageOf(doc: XliffDocument): string {
  for (const f of doc.files) if (f.sourceLanguage) return f.sourceLanguage
  return 'en'
}

async function ensureLocale(projectId: string, code: string): Promise<{ id: string; code: string }> {
  return prisma.locale.upsert({
    where: { projectId_code: { projectId, code } },
    update: {},
    create: { projectId, code, name: code },
    select: { id: true, code: true },
  })
}

/** Parse without writing: build a preview + placeholder warnings. */
export async function previewXliff(projectId: string, buffer: Buffer): Promise<XliffPreview> {
  const doc = parseXliff(buffer.toString('utf-8'))
  const targetLanguage = targetLanguageOf(doc)
  const sourceLanguage = sourceLanguageOf(doc)

  const preview: XliffPreview = {
    format: 'xliff',
    version: doc.version,
    sourceLanguage,
    targetLanguage,
    created: 0,
    updated: 0,
    skipped: 0,
    fileCount: doc.files.length,
    unitCount: 0,
    warnings: [],
    rows: [],
  }

  // Every key of the project and every target text, in two queries, so a
  // large file previews within D1's query limit.
  const keyIndex = await projectKeyIndex(projectId)
  const targetLocale = await prisma.locale.findUnique({
    where: { projectId_code: { projectId, code: targetLanguage } },
    select: { id: true },
  })
  const targetTexts = new Map<string, string>()
  if (targetLocale) {
    const found = await prisma.translation.findMany({
      where: { localeId: targetLocale.id, key: { projectId } },
      select: { keyId: true, text: true },
    })
    for (const t of found) targetTexts.set(t.keyId, t.text)
  }

  for (const file of doc.files) {
    const slug = slugifyOriginal(file.original)
    for (const unit of file.units) {
      preview.unitCount++
      if (unit.target && unit.target.trim()) {
        const v = validatePlaceholders(unit.source, unit.target)
        if (!v.ok) preview.warnings.push({ id: unit.id, message: v.errors.join('; ') })
      }
      const existingKey = keyIndex.get(`${slug}\u0000${unit.id}`)
      const oldTarget: string | null = existingKey ? (targetTexts.get(existingKey) ?? null) : null
      const status: 'create' | 'update' = existingKey ? 'update' : 'create'
      if (status === 'create') preview.created++
      else preview.updated++
      preview.rows.push({
        keyName: unit.id,
        namespaceName: file.original,
        status,
        localeChanges: [{ localeCode: targetLanguage, oldText: oldTarget, newText: unit.target ?? '' }],
      })
    }
  }

  return preview
}

/**
 * The largest skeleton stored in its row. D1 caps a row at 2 MB, and uploads
 * are capped at 1 MiB (routes/import.ts), so a skeleton always fits. The check
 * is here so that raising the upload limit cannot silently produce a row D1
 * refuses: past it, skeletons need R2 or rows of their own first.
 */
export const SKELETON_MAX_BYTES = 1_800_000

/**
 * Prepare an XLIFF import: check the plan, create its two locales, store the
 * skeleton, and return its units as rows for the import jobs
 * (import-job.service.ts). The source text is authoritative and arrives
 * APPROVED. The target keeps the state the file gives it.
 */
export async function prepareXliffImport(
  projectId: string,
  buffer: Buffer,
): Promise<{ rows: JobRow[]; targetLanguage: string; sourceLanguage: string }> {
  const rawXml = buffer.toString('utf-8')
  if (Buffer.byteLength(rawXml) > SKELETON_MAX_BYTES) {
    throw Object.assign(new Error('This XLIFF file is too large to import'), { statusCode: 413 })
  }
  const doc = parseXliff(rawXml)
  const targetLanguage = targetLanguageOf(doc)
  const sourceLanguage = sourceLanguageOf(doc)

  // On a hosted plan, refused before anything is written when the keys or
  // the locales it would create take the account past its plan.
  await assertLocalesFit(projectId, [sourceLanguage, targetLanguage])
  await assertKeysFit(
    projectId,
    doc.files.flatMap((f) => f.units.map((u) => ({ namespaceSlug: slugifyOriginal(f.original), name: u.id }))),
  )

  await ensureLocale(projectId, sourceLanguage)
  await ensureLocale(projectId, targetLanguage)

  // Store (or replace) the skeleton for this locale so export can regenerate it.
  const originals = JSON.stringify(doc.files.map((f) => f.original))
  await prisma.xliffSkeleton.upsert({
    where: { projectId_targetLanguage: { projectId, targetLanguage } },
    update: { document: rawXml, sourceLanguage, version: doc.version, originals },
    create: { projectId, targetLanguage, sourceLanguage, version: doc.version, document: rawXml, originals },
  })

  const rows: JobRow[] = doc.files.flatMap((file) =>
    file.units.map((unit) => ({
      row: 0,
      nsSlug: slugifyOriginal(file.original),
      nsName: file.original,
      key: unit.id,
      description: unit.note ?? null,
      cells: [
        { locale: sourceLanguage, text: unit.source, status: 'APPROVED' },
        ...(unit.target !== undefined
          ? [{ locale: targetLanguage, text: unit.target, status: stateToStatus(unit.state) }]
          : []),
      ],
    })),
  )
  return { rows, targetLanguage, sourceLanguage }
}

/** Regenerate XLIFF for a locale from its stored skeleton, overlaying current targets. */
export async function exportXliff(
  projectId: string,
  localeCode: string,
): Promise<{ data: string; contentType: string; filename: string }> {
  const skeleton = await prisma.xliffSkeleton.findUnique({
    where: { projectId_targetLanguage: { projectId, targetLanguage: localeCode } },
  })
  if (!skeleton) {
    throw Object.assign(new Error(`No XLIFF skeleton for locale "${localeCode}". Import an XLIFF file first.`), {
      statusCode: 404,
    })
  }

  const targetLocale = await prisma.locale.findUnique({
    where: { projectId_code: { projectId, code: localeCode } },
    select: { id: true },
  })

  const doc = parseXliff(skeleton.document)
  const overlays = new Map<string, XliffOverlay>()

  if (targetLocale) {
    for (const file of doc.files) {
      const slug = slugifyOriginal(file.original)
      const namespace = await prisma.namespace.findUnique({
        where: { projectId_slug: { projectId, slug } },
        select: { id: true },
      })
      if (!namespace) continue
      // Two flat reads, never a nested one: see key-index.service.ts.
      const [keys, texts] = await Promise.all([
        prisma.key.findMany({
          where: { namespaceId: namespace.id, deletedAt: null },
          select: { id: true, name: true },
        }),
        prisma.translation.findMany({
          where: { localeId: targetLocale.id, key: { namespaceId: namespace.id } },
          select: { keyId: true, text: true, status: true },
        }),
      ])
      const textOf = new Map(texts.map((t) => [t.keyId, { text: t.text, status: t.status }]))
      const byName = new Map(keys.map((k) => [k.name, textOf.get(k.id)]))
      for (const unit of file.units) {
        const tr = byName.get(unit.id)
        if (!tr) continue
        const state = resolveExportState(tr.status as never, unit.state)
        // Only overlay genuinely changed units so untouched nodes stay byte-stable.
        if (tr.text === unit.target && state === unit.state) continue
        overlays.set(unitKey(file.original, unit.id), { text: tr.text, state })
      }
    }
  }

  return {
    data: serializeXliff(skeleton.document, overlays),
    contentType: 'application/xml; charset=utf-8',
    filename: `${localeCode}.xliff`,
  }
}
