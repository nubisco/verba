import type { FastifyInstance } from 'fastify'
import { CreateLocaleSchema, UpdateLocaleSchema } from '../schemas/locale.schema.js'
import * as svc from '../services/locale.service.js'
import { requireProjectRole } from '../services/acl.service.js'
import { Role } from '../types.js'

export async function localeRoutes(app: FastifyInstance) {
  app.get<{ Params: { projectId: string } }>(
    '/projects/:projectId/locales',
    { preHandler: [app.authenticate] },
    async (req) => {
      await requireProjectRole(req.user.userId, req.params.projectId, Role.READER)
      return svc.listLocales(req.params.projectId)
    },
  )

  app.post<{ Params: { projectId: string } }>(
    '/projects/:projectId/locales',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      await requireProjectRole(req.user.userId, req.params.projectId, Role.MAINTAINER)
      const body = CreateLocaleSchema.parse(req.body)
      const locale = await svc.createLocale(req.params.projectId, body)
      return reply.status(201).send(locale)
    },
  )

  app.get<{ Params: { projectId: string; id: string } }>(
    '/projects/:projectId/locales/:id',
    { preHandler: [app.authenticate] },
    async (req) => {
      await requireProjectRole(req.user.userId, req.params.projectId, Role.READER)
      return svc.getLocale(req.params.projectId, req.params.id)
    },
  )

  app.patch<{ Params: { projectId: string; id: string } }>(
    '/projects/:projectId/locales/:id',
    { preHandler: [app.authenticate] },
    async (req) => {
      await requireProjectRole(req.user.userId, req.params.projectId, Role.MAINTAINER)
      const body = UpdateLocaleSchema.parse(req.body)
      return svc.updateLocale(req.params.projectId, req.params.id, body)
    },
  )

  app.delete<{ Params: { projectId: string; id: string } }>(
    '/projects/:projectId/locales/:id',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      await requireProjectRole(req.user.userId, req.params.projectId, Role.MAINTAINER)
      await svc.deleteLocale(req.params.projectId, req.params.id)
      return reply.status(204).send()
    },
  )
}
