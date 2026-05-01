import type { FastifyInstance } from 'fastify'
import { requireProjectRole } from '../services/acl.service.js'
import { listImportRuns, getImportRun } from '../services/import-run.service.js'
import { Role } from '../types.js'

export async function importRunRoutes(app: FastifyInstance) {
  app.get<{ Params: { projectId: string } }>(
    '/projects/:projectId/import-runs',
    { preHandler: [app.authenticate] },
    async (req) => {
      await requireProjectRole(req.user.userId, req.params.projectId, Role.READER)
      return listImportRuns(req.params.projectId)
    },
  )

  app.get<{ Params: { projectId: string; id: string } }>(
    '/projects/:projectId/import-runs/:id',
    { preHandler: [app.authenticate] },
    async (req) => {
      await requireProjectRole(req.user.userId, req.params.projectId, Role.READER)
      return getImportRun(req.params.projectId, req.params.id)
    },
  )
}
