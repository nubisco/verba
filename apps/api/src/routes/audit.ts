import type { Api } from '../http.js'
import { authenticate } from '../session.js'
import { AuditQuerySchema } from '../schemas/audit.schema.js'
import * as auditSvc from '../services/audit.service.js'
import { requireProjectRole } from '../services/acl.service.js'
import { Role } from '../types.js'

export function auditRoutes(app: Api) {
  app.get('/projects/:projectId/audit-logs', authenticate, async (c) => {
    await requireProjectRole(c.var.user.userId, c.req.param('projectId'), Role.READER)
    const { entityType, page, limit } = AuditQuerySchema.parse(c.req.query())
    return c.json(await auditSvc.listAuditLogs(c.req.param('projectId'), entityType, page, limit))
  })
}
