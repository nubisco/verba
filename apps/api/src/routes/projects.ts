import { readBody, type Api } from '../http.js'
import { authenticate } from '../session.js'
import { CreateProjectSchema, UpdateProjectSchema } from '../schemas/project.schema.js'
import * as svc from '../services/project.service.js'
import * as membershipService from '../services/membership.service.js'
import * as analytics from '../services/analytics.service.js'
import { requireProjectRole } from '../services/acl.service.js'
import { resolveAccount } from '../services/account.service.js'
import { accountSelector } from '../account-selector.js'
import { Role } from '../types.js'

export function projectRoutes(app: Api) {
  // The project list and project creation work in one account: the one the
  // request names, or the person's only account (account.service.ts).
  app.get('/projects', authenticate, async (c) => {
    const account = await resolveAccount(c.var.user.userId, accountSelector(c))
    return c.json(await svc.listProjects(c.var.user.userId, account.id))
  })

  app.post('/projects', authenticate, async (c) => {
    const body = CreateProjectSchema.parse(await readBody(c))
    const account = await resolveAccount(c.var.user.userId, accountSelector(c))
    const project = await svc.createProject(account.id, body)
    await membershipService.addMember(project.id, {
      userId: c.var.user.userId,
      role: Role.ADMIN,
    })
    analytics.track('project_created', {
      userId: c.var.user.userId,
      props: { project_id: project.id },
    })
    return c.json(project, 201)
  })

  app.get('/projects/:id', authenticate, async (c) => {
    await requireProjectRole(c.var.user.userId, c.req.param('id'), Role.READER)
    return c.json(await svc.getProject(c.req.param('id')))
  })

  app.patch('/projects/:id', authenticate, async (c) => {
    await requireProjectRole(c.var.user.userId, c.req.param('id'), Role.MAINTAINER)
    const body = UpdateProjectSchema.parse(await readBody(c))
    return c.json(await svc.updateProject(c.req.param('id'), body))
  })

  app.delete('/projects/:id', authenticate, async (c) => {
    await requireProjectRole(c.var.user.userId, c.req.param('id'), Role.ADMIN)
    await svc.deleteProject(c.req.param('id'))
    return c.body(null, 204)
  })
}
