import type { FastifyInstance } from 'fastify'
import { CreateNamespaceSchema, UpdateNamespaceSchema } from '../schemas/namespace.schema.js'
import * as svc from '../services/namespace.service.js'
import { requireProjectRole } from '../services/acl.service.js'
import { Role } from '../types.js'

export async function namespaceRoutes(app: FastifyInstance) {
  app.get<{ Params: { projectId: string } }>(
    '/projects/:projectId/namespaces',
    { preHandler: [app.authenticate] },
    async (req) => {
      await requireProjectRole(req.user.userId, req.params.projectId, Role.READER)
      return svc.listNamespaces(req.params.projectId)
    },
  )

  app.post<{ Params: { projectId: string } }>(
    '/projects/:projectId/namespaces',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      await requireProjectRole(req.user.userId, req.params.projectId, Role.MAINTAINER)
      const body = CreateNamespaceSchema.parse(req.body)
      const ns = await svc.createNamespace(req.params.projectId, body)
      return reply.status(201).send(ns)
    },
  )

  app.get<{ Params: { projectId: string; id: string } }>(
    '/projects/:projectId/namespaces/:id',
    { preHandler: [app.authenticate] },
    async (req) => {
      await requireProjectRole(req.user.userId, req.params.projectId, Role.READER)
      return svc.getNamespace(req.params.projectId, req.params.id)
    },
  )

  app.patch<{ Params: { projectId: string; id: string } }>(
    '/projects/:projectId/namespaces/:id',
    { preHandler: [app.authenticate] },
    async (req) => {
      await requireProjectRole(req.user.userId, req.params.projectId, Role.MAINTAINER)
      const body = UpdateNamespaceSchema.parse(req.body)
      return svc.updateNamespace(req.params.projectId, req.params.id, body)
    },
  )

  app.delete<{ Params: { projectId: string; id: string } }>(
    '/projects/:projectId/namespaces/:id',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      await requireProjectRole(req.user.userId, req.params.projectId, Role.MAINTAINER)
      await svc.deleteNamespace(req.params.projectId, req.params.id)
      return reply.status(204).send()
    },
  )
}
