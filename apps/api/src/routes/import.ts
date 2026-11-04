import { bodyLimit } from 'hono/body-limit'
import type { Api, Ctx } from '../http.js'
import { httpError } from '../http.js'
import { authenticate } from '../session.js'
import { requireProjectRole } from '../services/acl.service.js'
import * as analytics from '../services/analytics.service.js'
import { parseFile, prepareTabularImport, previewImport } from '../services/import.service.js'
import { isXliffUpload, prepareXliffImport, previewXliff } from '../services/xliff.service.js'
import { chunkRows, startRun } from '../services/import-job.service.js'
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

  // Applying runs as background jobs (import-job.service.ts): the answer is
  // 202 with the run, which the page follows until it is COMPLETED or FAILED.
  // The plan is checked here, before anything is written.
  app.post('/projects/:projectId/import/apply', authenticate, uploadBody, async (c) => {
    const projectId = c.req.param('projectId')
    const userId = c.var.user.userId
    await requireProjectRole(userId, projectId, Role.MAINTAINER)

    const data = await readUpload(c)
    const buffer = data.buffer
    const meta = { filename: data.filename, mimetype: data.mimetype }

    try {
      if (isXliffUpload(data.filename, data.mimetype, buffer)) {
        const { rows, targetLanguage, sourceLanguage } = await prepareXliffImport(projectId, buffer)
        const run = await startRun({
          projectId,
          userId,
          kind: 'import',
          meta: { ...meta, format: 'xliff', targetLanguage, sourceLanguage },
          chunks: chunkRows(rows),
          totalRows: rows.length,
        })
        return c.json({ ...run, targetLanguage }, 202)
      }

      const mappingField = data.fields.mapping
      if (!mappingField) throw httpError(400, 'mapping field is required')
      const mapping = ImportMappingSchema.parse(JSON.parse(mappingField))
      const { rows, skipped } = await prepareTabularImport(projectId, parseFile(buffer, data.mimetype, mapping))
      const run = await startRun({
        projectId,
        userId,
        kind: 'import',
        meta: { ...meta, ...mapping },
        chunks: chunkRows(rows),
        totalRows: rows.length,
        skipped,
      })
      return c.json(run, 202)
    } catch (err) {
      analytics.track('import_failed', {
        userId,
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
