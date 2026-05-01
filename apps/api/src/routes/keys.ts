import type { FastifyInstance } from 'fastify'
import { CreateKeySchema, UpdateKeySchema, KeyQuerySchema } from '../schemas/key.schema.js'
import * as svc from '../services/key.service.js'
import { requireProjectRole, canWriteNamespace } from '../services/acl.service.js'
import { Role } from '../types.js'
import { prisma } from '../prisma.js'
export async function keyRoutes(app: FastifyInstance) {
  // Project-level history
  app.get<{
    Params: { projectId: string }
    Querystring: { page?: string; limit?: string }
  }>('/projects/:projectId/history', { preHandler: [app.authenticate] }, async (req) => {
    const { projectId } = req.params
    await requireProjectRole(req.user.userId, projectId, Role.READER)
    const page = Math.max(1, parseInt(req.query.page ?? '1', 10))
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit ?? '50', 10)))
    const skip = (page - 1) * limit
    const [items, total] = await Promise.all([
      prisma.auditLog.findMany({
        where: { projectId },
        include: { user: { select: { id: true, email: true, name: true } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.auditLog.count({ where: { projectId } }),
    ])
    return {
      items: items.map((log) => ({
        id: log.id,
        action: log.action,
        entityType: log.entityType,
        entityId: log.entityId,
        createdAt: log.createdAt.toISOString(),
        user: log.user,
      })),
      total,
      page,
      limit,
    }
  })

  app.get<{
    Params: { projectId: string }
    Querystring: Record<string, string>
  }>('/projects/:projectId/keys', { preHandler: [app.authenticate] }, async (req) => {
    await requireProjectRole(req.user.userId, req.params.projectId, Role.READER)
    const query = KeyQuerySchema.parse(req.query)
    return svc.listKeys(req.params.projectId, query)
  })

  app.post<{ Params: { projectId: string } }>(
    '/projects/:projectId/keys',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const membership = await requireProjectRole(req.user.userId, req.params.projectId, Role.TRANSLATOR)
      const body = CreateKeySchema.parse(req.body)
      if (!canWriteNamespace(membership, body.namespaceId)) {
        throw Object.assign(new Error('Forbidden'), { statusCode: 403 })
      }
      const key = await svc.createKey(req.params.projectId, body, req.user.userId)
      return reply.status(201).send(key)
    },
  )

  app.get<{ Params: { projectId: string; id: string } }>(
    '/projects/:projectId/keys/:id',
    { preHandler: [app.authenticate] },
    async (req) => {
      await requireProjectRole(req.user.userId, req.params.projectId, Role.READER)
      return svc.getKey(req.params.projectId, req.params.id)
    },
  )

  app.patch<{ Params: { projectId: string; id: string } }>(
    '/projects/:projectId/keys/:id',
    { preHandler: [app.authenticate] },
    async (req) => {
      const membership = await requireProjectRole(req.user.userId, req.params.projectId, Role.TRANSLATOR)
      const body = UpdateKeySchema.parse(req.body)
      const key = await svc.getKey(req.params.projectId, req.params.id)
      if (!canWriteNamespace(membership, key.namespaceId)) {
        throw Object.assign(new Error('Forbidden'), { statusCode: 403 })
      }
      return svc.updateKey(req.params.projectId, req.params.id, body)
    },
  )

  app.delete<{ Params: { projectId: string; id: string } }>(
    '/projects/:projectId/keys/:id',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const membership = await requireProjectRole(req.user.userId, req.params.projectId, Role.TRANSLATOR)
      const key = await svc.getKey(req.params.projectId, req.params.id)
      if (!canWriteNamespace(membership, key.namespaceId)) {
        throw Object.assign(new Error('Forbidden'), { statusCode: 403 })
      }
      await svc.deleteKey(req.params.projectId, req.params.id, req.user.userId)
      return reply.status(204).send()
    },
  )

  app.post<{ Params: { projectId: string; id: string } }>(
    '/projects/:projectId/keys/:id/restore',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const membership = await requireProjectRole(req.user.userId, req.params.projectId, Role.ADMIN)
      if (!membership) throw Object.assign(new Error('Forbidden'), { statusCode: 403 })
      const key = await svc.restoreKey(req.params.projectId, req.params.id)
      return reply.status(200).send(key)
    },
  )

  app.get<{ Params: { projectId: string; keyId: string } }>(
    '/projects/:projectId/keys/:keyId/history',
    { preHandler: [app.authenticate] },
    async (req) => {
      const { projectId, keyId } = req.params
      await requireProjectRole(req.user.userId, projectId, Role.READER)

      const translationRows = await prisma.translation.findMany({
        where: { keyId, deletedAt: null },
        select: { id: true, locale: { select: { code: true } } },
      })
      const translationIds = translationRows.map((t) => t.id)
      const localeByTranslationId = new Map(translationRows.map((t) => [t.id, t.locale.code]))

      const auditLogs = await prisma.auditLog.findMany({
        where: {
          projectId,
          OR: [
            { entityType: 'Key', entityId: keyId },
            { entityType: 'Translation', entityId: { in: translationIds } },
          ],
        },
        include: { user: { select: { id: true, email: true, name: true } } },
        orderBy: { createdAt: 'desc' },
        take: 100,
      })

      const commentRows = await prisma.comment.findMany({
        where: { translationId: { in: translationIds }, deletedAt: null },
        include: { user: { select: { id: true, email: true, name: true } } },
        orderBy: { createdAt: 'desc' },
      })

      const auditEntries = auditLogs.map((log) => ({
        id: log.id,
        action: log.action,
        entityType: log.entityType,
        entityId: log.entityId,
        localeCode: log.entityType === 'Translation' ? localeByTranslationId.get(log.entityId) : undefined,
        createdAt: log.createdAt.toISOString(),
        user: log.user,
        meta: undefined as { text?: string } | undefined,
      }))

      const commentEntries = commentRows.map((c) => ({
        id: c.id,
        action: 'comment.added',
        entityType: 'translation',
        entityId: c.translationId,
        localeCode: localeByTranslationId.get(c.translationId),
        createdAt: c.createdAt.toISOString(),
        user: c.user,
        meta: { text: c.text.slice(0, 80) },
      }))

      const combined = [...auditEntries, ...commentEntries].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )

      return combined
    },
  )
}
