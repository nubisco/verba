import type { FastifyInstance } from 'fastify'
import { requireProjectRole } from '../services/acl.service.js'
import * as analytics from '../services/analytics.service.js'
import { parseFile, previewImport, applyImport } from '../services/import.service.js'
import { createImportRun, updateImportRun } from '../services/import-run.service.js'
import { ImportMappingSchema } from '../schemas/import.schema.js'
import { Role } from '../types.js'

export async function importRoutes(app: FastifyInstance) {
  app.post<{ Params: { projectId: string } }>(
    '/projects/:projectId/import/preview',
    { preHandler: [app.authenticate] },
    async (req) => {
      await requireProjectRole(req.user.userId, req.params.projectId, Role.MAINTAINER)

      const data = await req.file()
      if (!data) throw Object.assign(new Error('No file uploaded'), { statusCode: 400 })

      const fields = data.fields as Record<string, { value: string } | undefined>
      const mappingField = fields?.mapping?.value

      if (!mappingField)
        throw Object.assign(new Error('mapping field is required'), {
          statusCode: 400,
        })
      const mapping = ImportMappingSchema.parse(JSON.parse(mappingField))

      const chunks: Buffer[] = []
      for await (const chunk of data.file) {
        chunks.push(chunk)
      }
      const buffer = Buffer.concat(chunks)

      const rows = parseFile(buffer, data.mimetype, mapping)
      return previewImport(req.params.projectId, rows, mapping)
    },
  )

  app.post<{ Params: { projectId: string } }>(
    '/projects/:projectId/import/apply',
    { preHandler: [app.authenticate] },
    async (req) => {
      await requireProjectRole(req.user.userId, req.params.projectId, Role.MAINTAINER)

      const data = await req.file()
      if (!data) throw Object.assign(new Error('No file uploaded'), { statusCode: 400 })

      const fields = data.fields as Record<string, { value: string } | undefined>
      const mappingField = fields?.mapping?.value
      if (!mappingField)
        throw Object.assign(new Error('mapping field is required'), {
          statusCode: 400,
        })
      const mapping = ImportMappingSchema.parse(JSON.parse(mappingField))

      const chunks: Buffer[] = []
      for await (const chunk of data.file) {
        chunks.push(chunk)
      }
      const buffer = Buffer.concat(chunks)

      const importRun = await createImportRun(req.params.projectId, req.user.userId, mapping)

      try {
        const rows = parseFile(buffer, data.mimetype, mapping)
        const stats = await applyImport(req.params.projectId, rows, mapping, req.user.userId, importRun.id)
        analytics.track('import_completed', {
          userId: req.user.userId,
          props: {
            project_id: req.params.projectId,
            mimetype: data.mimetype,
            created: stats.created,
            updated: stats.updated,
            skipped: stats.skipped,
            error_count: stats.errors.length,
          },
        })
        return { importRunId: importRun.id, stats }
      } catch (err) {
        await updateImportRun(importRun.id, 'FAILED', {}, [
          { row: 0, message: err instanceof Error ? err.message : String(err) },
        ])
        analytics.track('import_failed', {
          userId: req.user.userId,
          props: {
            project_id: req.params.projectId,
            mimetype: data.mimetype,
            reason: err instanceof Error ? err.message.slice(0, 200) : String(err).slice(0, 200),
          },
        })
        throw err
      }
    },
  )
}
