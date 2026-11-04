// Imports and AI fills as chunked background jobs (jobs.ts).
//
// The request parses the upload, checks the plan, stores the rows as chunks
// and enqueues one job per chunk. Each job writes its chunk set-based: it
// reads every namespace, key and translation the chunk touches in a few
// queries, works out what changes in memory, and writes in small batches.
// So a chunk costs a few hundred queries at most, whatever the size of the
// file, and stays well inside D1's limit of about 1,000 per Worker invocation.
// The last chunk to finish closes the run.
//
// Every batch respects D1's 100 bound parameters per statement: lookups go in
// groups of IN_GROUP values, inserts in groups sized by their column count.

import { prisma } from '../prisma.js'
import * as audit from './audit.service.js'
import * as analytics from './analytics.service.js'
import { emit } from '../events.js'
import { enqueue, type Job } from '../jobs.js'
import { live } from '../live.js'
import { Role, Status } from '../types.js'
import { nextStatusOnSave } from './translation.service.js'

/** One cell of a row: a locale's text, and the status a file asked for (XLIFF). */
export interface JobCell {
  locale: string
  text: string
  status?: string
}

/** One key's worth of an import, as a chunk stores it. */
export interface JobRow {
  /** The row in the file, for error messages (0 when there is none, as in XLIFF). */
  row: number
  nsSlug: string
  nsName: string
  key: string
  /** Set by XLIFF (its `<note>`). Undefined leaves an existing key's description alone. */
  description?: string | null
  cells: JobCell[]
}

export interface ImportStats {
  created: number
  updated: number
  skipped: number
}

type RowError = { row: number; message: string }

/** Cells per chunk: few enough that a chunk's worst case stays far under 1,000 queries. */
export const CELLS_PER_CHUNK = 400
/** Values per IN (...) lookup, under D1's 100 bound parameters. */
export const IN_GROUP = 90
/** Keys per AI fill job: each one is a call to the provider and a save. */
export const AI_KEYS_PER_CHUNK = 25

function groups<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

/** Rows into chunks of at most CELLS_PER_CHUNK cells (a row is never split). */
export function chunkRows(rows: JobRow[], cellsPerChunk = CELLS_PER_CHUNK): JobRow[][] {
  const chunks: JobRow[][] = []
  let current: JobRow[] = []
  let cells = 0
  for (const row of rows) {
    const size = Math.max(1, row.cells.length)
    if (current.length > 0 && cells + size > cellsPerChunk) {
      chunks.push(current)
      current = []
      cells = 0
    }
    current.push(row)
    cells += size
  }
  if (current.length > 0) chunks.push(current)
  return chunks
}

// ── Starting a run ────────────────────────────────────────────────────────────

export interface StartedRun {
  importRunId: string
  status: string
  totalRows: number
}

/**
 * Create the run, store its chunks and enqueue a job for each. `meta` is kept
 * with the run (what was imported, for the run page and analytics).
 */
export async function startRun(input: {
  projectId: string
  userId: string | undefined
  kind: 'import' | 'ai.fill'
  meta: Record<string, unknown>
  /** One payload per job: rows of an import, or an AI fill chunk. */
  chunks: unknown[]
  totalRows: number
  skipped?: number
}): Promise<StartedRun> {
  const empty = input.chunks.length === 0
  const run = await prisma.importRun.create({
    data: {
      projectId: input.projectId,
      userId: input.userId,
      kind: input.kind,
      status: empty ? 'COMPLETED' : 'RUNNING',
      mapping: JSON.stringify(input.meta),
      totalRows: input.totalRows,
      stats: JSON.stringify(
        input.kind === 'import' ? { created: 0, updated: 0, skipped: input.skipped ?? 0 } : { filled: 0, skipped: 0 },
      ),
    },
  })
  if (empty) return { importRunId: run.id, status: run.status, totalRows: input.totalRows }

  // A chunk row has seven columns, so ten per insert stays under 100 parameters.
  for (const batch of groups(
    input.chunks.map((payload, index) => ({ importRunId: run.id, index, payload: JSON.stringify(payload) })),
    10,
  )) {
    await prisma.importChunk.createMany({ data: batch })
  }
  const stored = await prisma.importChunk.findMany({
    where: { importRunId: run.id },
    select: { id: true },
    orderBy: { index: 'asc' },
  })
  const kind: Job['kind'] = input.kind === 'import' ? 'import.chunk' : 'ai.fill.chunk'
  await enqueue(stored.map((c) => ({ kind, chunkId: c.id })))
  return { importRunId: run.id, status: 'RUNNING', totalRows: input.totalRows }
}

// ── One import chunk ──────────────────────────────────────────────────────────

/** The chunk, if it still has work to do. A Queue may deliver a message twice. */
async function claim(chunkId: string) {
  const chunk = await prisma.importChunk.findUnique({ where: { id: chunkId }, include: { run: true } })
  if (!chunk || chunk.status !== 'PENDING') return null
  return chunk
}

/** Write one chunk of an import, set-based. Returns what it did. */
export async function writeImportRows(
  projectId: string,
  rows: JobRow[],
  userId: string | undefined,
): Promise<{ stats: ImportStats; errors: RowError[]; changed: number }> {
  const stats: ImportStats = { created: 0, updated: 0, skipped: 0 }
  const errors: RowError[] = []

  // Locales: the codes the chunk names.
  const codes = [...new Set(rows.flatMap((r) => r.cells.map((c) => c.locale)))]
  const locales = codes.length
    ? await prisma.locale.findMany({ where: { projectId, code: { in: codes } }, select: { id: true, code: true } })
    : []
  const localeId = new Map(locales.map((l) => [l.code, l.id]))

  // Namespaces: find them, create the missing ones (a few per import at most).
  const slugs = new Map(rows.map((r) => [r.nsSlug, r.nsName]))
  const namespaces = await prisma.namespace.findMany({
    where: { projectId, slug: { in: [...slugs.keys()] } },
    select: { id: true, slug: true },
  })
  const nsId = new Map(namespaces.map((n) => [n.slug, n.id]))
  for (const [slug, name] of slugs) {
    if (nsId.has(slug)) continue
    // upsert, because another chunk of the same import may create it first.
    const ns = await prisma.namespace.upsert({
      where: { projectId_slug: { projectId, slug } },
      update: {},
      create: { projectId, name, slug },
      select: { id: true },
    })
    nsId.set(slug, ns.id)
  }

  // Keys: find them by name, then create the missing ones in batches.
  const keyOf = (namespaceId: string, name: string) => `${namespaceId}\u0000${name}`
  const keys = new Map<string, { id: string; description: string | null }>()
  for (const names of groups([...new Set(rows.map((r) => r.key))], IN_GROUP)) {
    const found = await prisma.key.findMany({
      where: { projectId, name: { in: names } },
      select: { id: true, name: true, namespaceId: true, description: true },
    })
    for (const k of found) keys.set(keyOf(k.namespaceId, k.name), { id: k.id, description: k.description })
  }

  const seen = new Set<string>()
  const toCreate: { projectId: string; namespaceId: string; name: string; description: string | null }[] = []
  const descriptionUpdates: { id: string; description: string | null }[] = []
  for (const row of rows) {
    if (!row.key) {
      stats.skipped++
      continue
    }
    const k = keyOf(nsId.get(row.nsSlug)!, row.key)
    const existing = keys.get(k)
    if (existing) {
      if (!seen.has(k)) stats.updated++
      if (row.description !== undefined && row.description !== existing.description) {
        descriptionUpdates.push({ id: existing.id, description: row.description })
        existing.description = row.description
      }
    } else if (!seen.has(k)) {
      stats.created++
      toCreate.push({
        projectId,
        namespaceId: nsId.get(row.nsSlug)!,
        name: row.key,
        description: row.description ?? null,
      })
    }
    seen.add(k)
  }
  // Six columns per key, so fifteen keys per insert.
  for (const batch of groups(toCreate, 15)) {
    const created = await prisma.key.createManyAndReturn({
      data: batch,
      select: { id: true, name: true, namespaceId: true, description: true },
    })
    for (const k of created) keys.set(keyOf(k.namespaceId, k.name), { id: k.id, description: k.description })
  }
  for (const update of descriptionUpdates) {
    await prisma.key.update({ where: { id: update.id }, data: { description: update.description } })
  }

  // Translations of these keys in these locales, as they are now.
  const keyIds = [...new Set([...keys.values()].map((k) => k.id))]
  const existing = new Map<
    string,
    { id: string; text: string; status: string; version: number; assignedToId: string | null }
  >()
  const localeIds = [...localeId.values()]
  if (localeIds.length > 0) {
    for (const ids of groups(keyIds, IN_GROUP - localeIds.length)) {
      const found = await prisma.translation.findMany({
        where: { keyId: { in: ids }, localeId: { in: localeIds } },
        select: { id: true, keyId: true, localeId: true, text: true, status: true, version: true, assignedToId: true },
      })
      for (const t of found) existing.set(`${t.keyId}\u0000${t.localeId}`, t)
    }
  }

  // Work out every write in memory. Imports run behind the MAINTAINER role
  // (routes/import.ts), so an assignment never blocks them, as before.
  const creates: { keyId: string; localeId: string; text: string; status: string; updatedById?: string }[] = []
  const updates: { id: string; text: string; status: string; version: number; before: string; keyId: string }[] = []
  const statusOnly: { id: string; status: string }[] = []
  const planned = new Set<string>()
  for (const row of rows) {
    if (!row.key) continue
    const key = keys.get(keyOf(nsId.get(row.nsSlug)!, row.key))!
    for (const cell of row.cells) {
      const locale = localeId.get(cell.locale)
      if (!locale) {
        errors.push({ row: row.row, message: `Locale "${cell.locale}" not found in project` })
        continue
      }
      const at = `${key.id}\u0000${locale}`
      if (planned.has(at)) continue // a later duplicate in the same chunk loses, as the first write won before
      planned.add(at)
      const current = existing.get(at)
      if (!current) {
        creates.push({
          keyId: key.id,
          localeId: locale,
          text: cell.text,
          status: cell.status ?? Status.TODO,
          ...(userId ? { updatedById: userId } : {}),
        })
        continue
      }
      const textChanged = cell.text !== current.text
      const status = nextStatusOnSave(current.status, textChanged, cell.status, Role.MAINTAINER)
      if (textChanged) {
        updates.push({
          id: current.id,
          text: cell.text,
          status,
          version: current.version + 1,
          before: current.text,
          keyId: key.id,
        })
      } else if (status !== current.status) {
        statusOnly.push({ id: current.id, status })
      }
    }
  }

  // Eight columns per translation, so ten per insert.
  for (const batch of groups(creates, 10)) await prisma.translation.createMany({ data: batch })
  for (const u of updates) {
    await prisma.translation.update({
      where: { id: u.id },
      data: { text: u.text, status: u.status, version: u.version, ...(userId ? { updatedById: userId } : {}) },
    })
  }
  for (const s of statusOnly) {
    await prisma.translation.update({ where: { id: s.id }, data: { status: s.status } })
  }

  // The audit trail and the event bus see every text change, as a save does.
  await audit.logMany(
    updates.map((u) => ({
      projectId,
      userId,
      action: 'translation.updated_text',
      entityType: 'Translation',
      entityId: u.id,
      before: { text: u.before },
      after: { text: u.text },
    })),
  )
  for (const u of updates) {
    emit({
      type: 'translation.updated_text',
      translationId: u.id,
      keyId: u.keyId,
      projectId,
      before: u.before,
      after: u.text,
    })
  }

  return { stats, errors, changed: creates.length + updates.length + statusOnly.length }
}

/** The job for one chunk of an import. */
export async function runImportChunk(chunkId: string): Promise<void> {
  const chunk = await claim(chunkId)
  if (!chunk) return
  const rows = JSON.parse(chunk.payload) as JobRow[]
  try {
    const { stats, errors } = await writeImportRows(chunk.run.projectId, rows, chunk.run.userId ?? undefined)
    await finishChunk(chunk.id, chunk.importRunId, chunk.run.projectId, rows.length, 'DONE', stats, errors)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await finishChunk(chunk.id, chunk.importRunId, chunk.run.projectId, rows.length, 'FAILED', {}, [
      { row: rows[0]?.row ?? 0, message: `Rows ${rows[0]?.row ?? '?'} to ${rows.at(-1)?.row ?? '?'}: ${message}` },
    ])
  }
}

// ── Closing a run ─────────────────────────────────────────────────────────────

/** Record a chunk as done, tell the tabs, and close the run when it was the last. */
export async function finishChunk(
  chunkId: string,
  importRunId: string,
  projectId: string,
  rowCount: number,
  status: 'DONE' | 'FAILED',
  stats: object,
  errors: object[],
): Promise<void> {
  await prisma.importChunk.update({
    where: { id: chunkId },
    data: { status, stats: JSON.stringify(stats), errors: JSON.stringify(errors), payload: '[]' },
  })
  const run = await prisma.importRun.update({
    where: { id: importRunId },
    data: { processedRows: { increment: rowCount } },
    select: { processedRows: true, totalRows: true },
  })
  const pending = await prisma.importChunk.count({ where: { importRunId, status: 'PENDING' } })
  if (pending === 0) await closeRun(importRunId)
  // What changed, never the content: the tab re-reads the run.
  live().broadcast(projectId, {
    type: 'import.progress',
    importRunId,
    processedRows: run.processedRows,
    totalRows: run.totalRows,
  })
}

/** Sum the chunks into the run, once. Two chunks finishing together cannot both close it. */
export async function closeRun(importRunId: string): Promise<void> {
  const chunks = await prisma.importChunk.findMany({
    where: { importRunId },
    select: { status: true, stats: true, errors: true },
  })
  const run = await prisma.importRun.findUnique({ where: { id: importRunId } })
  if (!run || run.status !== 'RUNNING') return
  const totals: Record<string, number> = JSON.parse(run.stats || '{}')
  const errors: unknown[] = []
  for (const chunk of chunks) {
    for (const [name, value] of Object.entries(JSON.parse(chunk.stats) as Record<string, unknown>)) {
      if (typeof value === 'number') totals[name] = (totals[name] ?? 0) + value
    }
    errors.push(...(JSON.parse(chunk.errors) as unknown[]))
  }
  const failed = chunks.some((c) => c.status === 'FAILED')
  const status = failed ? 'FAILED' : 'COMPLETED'
  const closed = await prisma.importRun.updateMany({
    where: { id: importRunId, status: 'RUNNING' },
    data: { status, stats: JSON.stringify(totals), errors: JSON.stringify(errors) },
  })
  if (closed.count === 0) return

  const meta = JSON.parse(run.mapping || '{}') as { mimetype?: string; format?: string }
  if (run.kind === 'import') {
    emit({
      type: 'import.applied',
      projectId: run.projectId,
      created: totals.created ?? 0,
      updated: totals.updated ?? 0,
    })
    analytics.track(failed ? 'import_failed' : 'import_completed', {
      userId: run.userId,
      props: {
        project_id: run.projectId,
        mimetype: meta.mimetype,
        format: meta.format,
        created: totals.created,
        updated: totals.updated,
        skipped: totals.skipped,
        error_count: errors.length,
      },
    })
  }
  live().broadcast(run.projectId, { type: 'import.finished', importRunId, status })
}
