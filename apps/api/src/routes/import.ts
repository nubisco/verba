import { bodyLimit } from 'hono/body-limit'
import type { Api, Ctx } from '../http.js'
import { httpError } from '../http.js'
import { authenticate } from '../session.js'
import { requireProjectRole } from '../services/acl.service.js'
import * as analytics from '../services/analytics.service.js'
import { parseFile, previewImport, applyImport } from '../services/import.service.js'
import { isXliffUpload, previewXliff, importXliff } from '../services/xliff.service.js'
import { createImportRun, updateImportRun } from '../services/import-run.service.js'
import { ImportMappingSchema } from '../schemas/import.schema.js'
import { Role } from '../types.js'

/** The largest file an import takes: 1 MiB, Fastify's default that it always had. */
export const UPLOAD_LIMIT_BYTES = 1024 * 1024

/** A multipart body never needs much more than its file, so cap it before reading. */
const uploadBody = bodyLimit({
  maxSize: 2 * UPLOAD_LIMIT_BYTES,
  onError: (c) => c.json({ error: 'request file too large' }, 413),
})

interface Upload {
  buffer: Buffer
  filename: string
  mimetype: string
  fields: Record<string, string>
}

/** The first file in a multipart body, and the text fields beside it. */
async function readUpload(c: Ctx): Promise<Upload> {
  let form: Record<string, string | File | (string | File)[]>
  try {
    form = await c.req.parseBody({ all: true })
  } catch {
    throw httpError(400, 'No file uploaded')
  }
  let file: File | undefined
  const fields: Record<string, string> = {}
  for (const [name, value] of Object.entries(form)) {
    for (const item of ([] as (string | File)[]).concat(value)) {
      if (typeof item === 'string') fields[name] ??= item
      else file ??= item
    }
  }
  if (!file) throw httpError(400, 'No file uploaded')
  if (file.size > UPLOAD_LIMIT_BYTES) throw httpError(413, 'request file too large')
  return {
    buffer: Buffer.from(await file.arrayBuffer()),
    filename: file.name,
    // A part with no type of its own is text/plain (RFC 7578), as busboy read it.
    mimetype: file.type || 'text/plain',
    fields,
  }
}

export function importRoutes(app: Api) {
  app.post('/projects/:projectId/import/preview', authenticate, uploadBody, async (c) => {
    const projectId = c.req.param('projectId')
    await requireProjectRole(c.var.user.userId, projectId, Role.MAINTAINER)

    const data = await readUpload(c)
    const buffer = data.buffer

    // XLIFF is self-describing (locales and keys embedded), so it needs no column mapping.
    if (isXliffUpload(data.filename, data.mimetype, buffer)) {
      return c.json(await previewXliff(projectId, buffer))
    }

    const mappingField = data.fields.mapping
    if (!mappingField) throw httpError(400, 'mapping field is required')
    const mapping = ImportMappingSchema.parse(JSON.parse(mappingField))

    const rows = parseFile(buffer, data.mimetype, mapping)
    return c.json(await previewImport(projectId, rows, mapping))
  })

  app.post('/projects/:projectId/import/apply', authenticate, uploadBody, async (c) => {
    const projectId = c.req.param('projectId')
    const userId = c.var.user.userId
    await requireProjectRole(userId, projectId, Role.MAINTAINER)

    const data = await readUpload(c)
    const buffer = data.buffer

    if (isXliffUpload(data.filename, data.mimetype, buffer)) {
      const mapping = ImportMappingSchema.parse({})
      const importRun = await createImportRun(projectId, userId, mapping)
      try {
        const stats = await importXliff(projectId, buffer, userId, importRun.id)
        return c.json({ importRunId: importRun.id, stats })
      } catch (err) {
        await updateImportRun(importRun.id, 'FAILED', {}, [
          { row: 0, message: err instanceof Error ? err.message : String(err) },
        ])
        throw err
      }
    }

    const mappingField = data.fields.mapping
    if (!mappingField) throw httpError(400, 'mapping field is required')
    const mapping = ImportMappingSchema.parse(JSON.parse(mappingField))

    const importRun = await createImportRun(projectId, userId, mapping)
    try {
      const rows = parseFile(buffer, data.mimetype, mapping)
      const stats = await applyImport(projectId, rows, mapping, userId, importRun.id)
      analytics.track('import_completed', {
        userId: userId,
        props: {
          project_id: projectId,
          mimetype: data.mimetype,
          created: stats.created,
          updated: stats.updated,
          skipped: stats.skipped,
          error_count: stats.errors.length,
        },
      })
      return c.json({ importRunId: importRun.id, stats })
    } catch (err) {
      await updateImportRun(importRun.id, 'FAILED', {}, [
        { row: 0, message: err instanceof Error ? err.message : String(err) },
      ])
      analytics.track('import_failed', {
        userId: userId,
        props: {
          project_id: projectId,
          mimetype: data.mimetype,
          reason: err instanceof Error ? err.message.slice(0, 200) : String(err).slice(0, 200),
        },
      })
      throw err
    }
  })
}
