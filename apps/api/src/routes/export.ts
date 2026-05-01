import type { FastifyInstance } from 'fastify'
import { requireProjectRole } from '../services/acl.service.js'
import { exportLocale, exportTranslations } from '../services/export.service.js'
import { Role } from '../types.js'
import { z } from 'zod'

const ExportQuerySchema = z.object({
  format: z.enum(['json', 'csv', 'xlsx']).default('json'),
  locale: z.string().optional(),
  status: z.string().optional(),
  resolve: z.coerce.boolean().optional().default(false),
  splitByNamespace: z.coerce.boolean().optional().default(false),
})

export async function exportRoutes(app: FastifyInstance) {
  app.get<{ Params: { projectId: string; localeCode: string } }>(
    '/projects/:projectId/export/:localeCode.json',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      await requireProjectRole(req.user.userId, req.params.projectId, Role.READER)
      const data = await exportLocale(req.params.projectId, req.params.localeCode)
      reply.header('Content-Type', 'application/json; charset=utf-8')
      reply.header('Content-Disposition', `attachment; filename="${req.params.localeCode}.json"`)
      return reply.send(JSON.stringify(data, null, 2))
    },
  )

  app.get<{
    Params: { projectId: string }
    Querystring: Record<string, string>
  }>('/projects/:projectId/export', { preHandler: [app.authenticate] }, async (req, reply) => {
    await requireProjectRole(req.user.userId, req.params.projectId, Role.READER)
    const opts = ExportQuerySchema.parse(req.query)
    const result = await exportTranslations(req.params.projectId, opts)
    reply.header('Content-Type', result.contentType)
    reply.header('Content-Disposition', `attachment; filename="${result.filename}"`)
    return reply.send(result.data)
  })
}
