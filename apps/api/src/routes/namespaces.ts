import { readBody, type Api } from '../http.js'
import { authenticate } from '../session.js'
import { CreateNamespaceSchema, UpdateNamespaceSchema } from '../schemas/namespace.schema.js'
import * as svc from '../services/namespace.service.js'
import { requireProjectRole } from '../services/acl.service.js'
import { Role } from '../types.js'

export function namespaceRoutes(app: Api) {
  app.get('/projects/:projectId/namespaces', authenticate, async (c) => {
    await requireProjectRole(c.var.user.userId, c.req.param('projectId'), Role.READER)
    return c.json(await svc.listNamespaces(c.req.param('projectId')))
  })

  app.post('/projects/:projectId/namespaces', authenticate, async (c) => {
    await requireProjectRole(c.var.user.userId, c.req.param('projectId'), Role.MAINTAINER)
    const body = CreateNamespaceSchema.parse(await readBody(c))
    const ns = await svc.createNamespace(c.req.param('projectId'), body)
    return c.json(ns, 201)
  })

  app.get('/projects/:projectId/namespaces/:id', authenticate, async (c) => {
    await requireProjectRole(c.var.user.userId, c.req.param('projectId'), Role.READER)
    return c.json(await svc.getNamespace(c.req.param('projectId'), c.req.param('id')))
  })

  app.patch('/projects/:projectId/namespaces/:id', authenticate, async (c) => {
    await requireProjectRole(c.var.user.userId, c.req.param('projectId'), Role.MAINTAINER)
    const body = UpdateNamespaceSchema.parse(await readBody(c))
    return c.json(await svc.updateNamespace(c.req.param('projectId'), c.req.param('id'), body))
  })

  app.delete('/projects/:projectId/namespaces/:id', authenticate, async (c) => {
    await requireProjectRole(c.var.user.userId, c.req.param('projectId'), Role.MAINTAINER)
    await svc.deleteNamespace(c.req.param('projectId'), c.req.param('id'))
    return c.body(null, 204)
  })
}
