import { readBody, type Api } from '../http.js'
import { authenticate } from '../session.js'
import { CreateKeySchema, UpdateKeySchema, KeyQuerySchema } from '../schemas/key.schema.js'
import * as svc from '../services/key.service.js'
import * as analytics from '../services/analytics.service.js'
import { requireProjectRole, canWriteNamespace } from '../services/acl.service.js'
import { Role } from '../types.js'
import { prisma } from '../prisma.js'

export function keyRoutes(app: Api) {
  // Project-level history
  app.get('/projects/:projectId/history', authenticate, async (c) => {
    const projectId = c.req.param('projectId')
    await requireProjectRole(c.var.user.userId, projectId, Role.READER)
    const page = Math.max(1, parseInt(c.req.query('page') ?? '1', 10))
    const limit = Math.min(100, Math.max(1, parseInt(c.req.query('limit') ?? '50', 10)))
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
    return c.json({
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
    })
  })

  app.get('/projects/:projectId/keys', authenticate, async (c) => {
    await requireProjectRole(c.var.user.userId, c.req.param('projectId'), Role.READER)
    const query = KeyQuerySchema.parse(c.req.query())
    return c.json(await svc.listKeys(c.req.param('projectId'), query))
  })

  app.post('/projects/:projectId/keys', authenticate, async (c) => {
    const membership = await requireProjectRole(c.var.user.userId, c.req.param('projectId'), Role.TRANSLATOR)
    const body = CreateKeySchema.parse(await readBody(c))
    if (!canWriteNamespace(membership, body.namespaceId)) {
      throw Object.assign(new Error('Forbidden'), { statusCode: 403 })
    }
    const key = await svc.createKey(c.req.param('projectId'), body, c.var.user.userId)
    analytics.track('key_added_manual', {
      userId: c.var.user.userId,
      props: { project_id: c.req.param('projectId') },
    })
    return c.json(key, 201)
  })

  app.get('/projects/:projectId/keys/:id', authenticate, async (c) => {
    await requireProjectRole(c.var.user.userId, c.req.param('projectId'), Role.READER)
    return c.json(await svc.getKey(c.req.param('projectId'), c.req.param('id')))
  })

  app.patch('/projects/:projectId/keys/:id', authenticate, async (c) => {
    const membership = await requireProjectRole(c.var.user.userId, c.req.param('projectId'), Role.TRANSLATOR)
    const body = UpdateKeySchema.parse(await readBody(c))
    const key = await svc.getKey(c.req.param('projectId'), c.req.param('id'))
    if (!canWriteNamespace(membership, key.namespaceId)) {
      throw Object.assign(new Error('Forbidden'), { statusCode: 403 })
    }
    const updated = await svc.updateKey(c.req.param('projectId'), c.req.param('id'), body)
    analytics.track('key_edited', {
      userId: c.var.user.userId,
      props: { project_id: c.req.param('projectId') },
    })
    return c.json(updated)
  })

  app.delete('/projects/:projectId/keys/:id', authenticate, async (c) => {
    const membership = await requireProjectRole(c.var.user.userId, c.req.param('projectId'), Role.TRANSLATOR)
    const key = await svc.getKey(c.req.param('projectId'), c.req.param('id'))
    if (!canWriteNamespace(membership, key.namespaceId)) {
      throw Object.assign(new Error('Forbidden'), { statusCode: 403 })
    }
    await svc.deleteKey(c.req.param('projectId'), c.req.param('id'), c.var.user.userId)
    analytics.track('key_deleted', {
      userId: c.var.user.userId,
      props: { project_id: c.req.param('projectId') },
    })
    return c.body(null, 204)
  })

  app.post('/projects/:projectId/keys/:id/restore', authenticate, async (c) => {
    const membership = await requireProjectRole(c.var.user.userId, c.req.param('projectId'), Role.ADMIN)
    if (!membership) throw Object.assign(new Error('Forbidden'), { statusCode: 403 })
    const key = await svc.restoreKey(c.req.param('projectId'), c.req.param('id'))
    return c.json(key, 200)
  })

  app.get('/projects/:projectId/keys/:keyId/history', authenticate, async (c) => {
    const projectId = c.req.param('projectId')
    const keyId = c.req.param('keyId')
    await requireProjectRole(c.var.user.userId, projectId, Role.READER)
    // Without this, any key id (and so its comments and their authors'
    // emails) was readable through any project the caller could read.
    await svc.assertKeyInProject(projectId, keyId)

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

    const commentEntries = commentRows.map((comment) => ({
      id: comment.id,
      action: 'comment.added',
      entityType: 'translation',
      entityId: comment.translationId,
      localeCode: localeByTranslationId.get(comment.translationId),
      createdAt: comment.createdAt.toISOString(),
      user: comment.user,
      meta: { text: comment.text.slice(0, 80) },
    }))

    const combined = [...auditEntries, ...commentEntries].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )

    return c.json(combined)
  })
}
