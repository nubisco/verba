import type { FastifyInstance } from 'fastify'
import { AuditQuerySchema } from '../schemas/audit.schema.js'
import * as auditSvc from '../services/audit.service.js'
import { requireProjectRole } from '../services/acl.service.js'
import { Role } from '../types.js'

export async function auditRoutes(app: FastifyInstance) {
  app.get<{
    Params: { projectId: string }
    Querystring: Record<string, string>
  }>('/projects/:projectId/audit-logs', { preHandler: [app.authenticate] }, async (req) => {
    await requireProjectRole(req.user.userId, req.params.projectId, Role.READER)
    const { entityType, page, limit } = AuditQuerySchema.parse(req.query)
    return auditSvc.listAuditLogs(req.params.projectId, entityType, page, limit)
  })
}
