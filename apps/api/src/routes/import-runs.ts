import type { Api } from '../http.js'
import { authenticate } from '../session.js'
import { requireProjectRole } from '../services/acl.service.js'
import { listImportRuns, getImportRun } from '../services/import-run.service.js'
import { Role } from '../types.js'

export function importRunRoutes(app: Api) {
  app.get('/projects/:projectId/import-runs', authenticate, async (c) => {
    await requireProjectRole(c.var.user.userId, c.req.param('projectId'), Role.READER)
    return c.json(await listImportRuns(c.req.param('projectId')))
  })

  app.get('/projects/:projectId/import-runs/:id', authenticate, async (c) => {
    await requireProjectRole(c.var.user.userId, c.req.param('projectId'), Role.READER)
    return c.json(await getImportRun(c.req.param('projectId'), c.req.param('id')))
  })
}
