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
import { upsertTranslation } from './translation.service.js'
import { updateImportRun } from './import-run.service.js'
import { emit } from '../events.js'

export interface XliffStats {
  created: number
  updated: number
  skipped: number
  errors: { row: number; message: string }[]
}

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

  for (const file of doc.files) {
    const slug = slugifyOriginal(file.original)
    const namespace = await prisma.namespace.findUnique({
      where: { projectId_slug: { projectId, slug } },
      select: { id: true },
    })
    for (const unit of file.units) {
      preview.unitCount++
      if (unit.target && unit.target.trim()) {
        const v = validatePlaceholders(unit.source, unit.target)
        if (!v.ok) preview.warnings.push({ id: unit.id, message: v.errors.join('; ') })
      }
      const existingKey = namespace
        ? await prisma.key.findUnique({
            where: { namespaceId_name: { namespaceId: namespace.id, name: unit.id } },
            select: { id: true },
          })
        : null
      let oldTarget: string | null = null
      if (existingKey) {
        const targetLocale = await prisma.locale.findUnique({
          where: { projectId_code: { projectId, code: targetLanguage } },
          select: { id: true },
        })
        if (targetLocale) {
          const tr = await prisma.translation.findUnique({
            where: { keyId_localeId: { keyId: existingKey.id, localeId: targetLocale.id } },
            select: { text: true },
          })
          oldTarget = tr?.text ?? null
        }
      }
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

/** Import an XLIFF document: project units into Verba and store the skeleton. */
export async function importXliff(
  projectId: string,
  buffer: Buffer,
  userId: string | undefined,
  importRunId: string,
): Promise<XliffStats> {
  const stats: XliffStats = { created: 0, updated: 0, skipped: 0, errors: [] }
  const rawXml = buffer.toString('utf-8')
  const doc = parseXliff(rawXml)
  const targetLanguage = targetLanguageOf(doc)
  const sourceLanguage = sourceLanguageOf(doc)

  const sourceLocale = await ensureLocale(projectId, sourceLanguage)
  const targetLocale = await ensureLocale(projectId, targetLanguage)

  for (const file of doc.files) {
    const slug = slugifyOriginal(file.original)
    const namespace = await prisma.namespace.upsert({
      where: { projectId_slug: { projectId, slug } },
      update: {},
      create: { projectId, name: file.original, slug },
      select: { id: true },
    })

    for (const unit of file.units) {
      try {
        const existing = await prisma.key.findUnique({
          where: { namespaceId_name: { namespaceId: namespace.id, name: unit.id } },
          select: { id: true },
        })
        const key = existing
          ? await prisma.key.update({
              where: { id: existing.id },
              data: { description: unit.note ?? null },
              select: { id: true },
            })
          : await prisma.key.create({
              data: { projectId, namespaceId: namespace.id, name: unit.id, description: unit.note ?? null },
              select: { id: true },
            })
        if (existing) stats.updated++
        else stats.created++

        // Source text is authoritative and read-only in Verba.
        await upsertTranslation(key.id, sourceLocale.id, { text: unit.source, status: 'APPROVED' }, userId)

        if (unit.target !== undefined) {
          await upsertTranslation(
            key.id,
            targetLocale.id,
            { text: unit.target, status: stateToStatus(unit.state) },
            userId,
          )
        }
      } catch (err) {
        stats.errors.push({ row: 0, message: `${unit.id}: ${err instanceof Error ? err.message : String(err)}` })
      }
    }
  }

  // Store (or replace) the skeleton for this locale so export can regenerate it.
  const originals = JSON.stringify(doc.files.map((f) => f.original))
  await prisma.xliffSkeleton.upsert({
    where: { projectId_targetLanguage: { projectId, targetLanguage } },
    update: { document: rawXml, sourceLanguage, version: doc.version, originals },
    create: { projectId, targetLanguage, sourceLanguage, version: doc.version, document: rawXml, originals },
  })

  await updateImportRun(
    importRunId,
    'COMPLETED',
    { created: stats.created, updated: stats.updated, skipped: stats.skipped },
    stats.errors,
  )
  emit({ type: 'import.applied', projectId, created: stats.created, updated: stats.updated })

  return stats
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
      const keys = await prisma.key.findMany({
        where: { namespaceId: namespace.id, deletedAt: null },
        select: {
          name: true,
          translations: { where: { localeId: targetLocale.id }, select: { text: true, status: true } },
        },
      })
      const byName = new Map(keys.map((k) => [k.name, k.translations[0]]))
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
