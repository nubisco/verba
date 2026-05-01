import type { FastifyInstance } from 'fastify'
import {
  UpsertTranslationSchema,
  UpdateTranslationStatusSchema,
  TranslationQuerySchema,
} from '../schemas/translation.schema.js'
import { z } from 'zod'
import * as svc from '../services/translation.service.js'
import * as keySvc from '../services/key.service.js'
import { requireProjectRole, canWriteNamespace } from '../services/acl.service.js'
import { Role } from '../types.js'

const AssignTranslationSchema = z.object({
  assigneeId: z.string().nullable(),
})

export async function translationRoutes(app: FastifyInstance) {
  app.get<{
    Params: { projectId: string }
    Querystring: Record<string, string>
  }>('/projects/:projectId/translations', { preHandler: [app.authenticate] }, async (req) => {
    await requireProjectRole(req.user.userId, req.params.projectId, Role.READER)
    const query = TranslationQuerySchema.parse(req.query)
    return svc.listTranslations(req.params.projectId, query)
  })

  app.get<{ Params: { projectId: string; id: string } }>(
    '/projects/:projectId/translations/:id',
    { preHandler: [app.authenticate] },
    async (req) => {
      await requireProjectRole(req.user.userId, req.params.projectId, Role.READER)
      return svc.getTranslation(req.params.id)
    },
  )

  app.put<{ Params: { projectId: string; keyId: string; localeId: string } }>(
    '/projects/:projectId/keys/:keyId/translations/:localeId',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const membership = await requireProjectRole(req.user.userId, req.params.projectId, Role.TRANSLATOR)
      const key = await keySvc.getKey(req.params.projectId, req.params.keyId)
      if (!canWriteNamespace(membership, key.namespaceId)) {
        throw Object.assign(new Error('Forbidden'), { statusCode: 403 })
      }
      const body = UpsertTranslationSchema.parse(req.body)
      const t = await svc.upsertTranslation(
        req.params.keyId,
        req.params.localeId,
        body,
        req.user.userId,
        membership.role,
      )
      return reply.status(200).send(t)
    },
  )

  app.get<{ Params: { projectId: string } }>(
    '/projects/:projectId/kanban',
    { preHandler: [app.authenticate] },
    async (req) => {
      await requireProjectRole(req.user.userId, req.params.projectId, Role.READER)
      return svc.listTranslationsForKanban(req.params.projectId)
    },
  )

  app.patch<{ Params: { projectId: string; id: string } }>(
    '/projects/:projectId/translations/:id/status',
    { preHandler: [app.authenticate] },
    async (req) => {
      const membership = await requireProjectRole(req.user.userId, req.params.projectId, Role.TRANSLATOR)
      const body = UpdateTranslationStatusSchema.parse(req.body)
      const translation = await svc.getTranslation(req.params.id)
      if (!canWriteNamespace(membership, translation.key.namespaceId)) {
        throw Object.assign(new Error('Forbidden'), { statusCode: 403 })
      }
      return svc.updateStatus(req.params.id, body.status, membership.role, req.user.userId)
    },
  )

  app.patch<{ Params: { projectId: string; translationId: string } }>(
    '/projects/:projectId/translations/:translationId/assign',
    { preHandler: [app.authenticate] },
    async (req) => {
      const membership = await requireProjectRole(req.user.userId, req.params.projectId, Role.TRANSLATOR)
      const body = AssignTranslationSchema.parse(req.body)
      return svc.assignTranslation(
        req.params.projectId,
        req.params.translationId,
        body.assigneeId,
        membership.role,
        req.user.userId,
      )
    },
  )
}
