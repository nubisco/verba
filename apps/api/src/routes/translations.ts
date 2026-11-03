import { readBody, type Api } from '../http.js'
import { authenticate } from '../session.js'
import {
  UpsertTranslationSchema,
  UpdateTranslationStatusSchema,
  TranslationQuerySchema,
} from '../schemas/translation.schema.js'
import { z } from 'zod'
import * as svc from '../services/translation.service.js'
import * as keySvc from '../services/key.service.js'
import * as localeSvc from '../services/locale.service.js'
import * as analytics from '../services/analytics.service.js'
import { requireProjectRole, canWriteNamespace } from '../services/acl.service.js'
import { Role } from '../types.js'

const AssignTranslationSchema = z.object({
  assigneeId: z.string().nullable(),
})

export function translationRoutes(app: Api) {
  app.get('/projects/:projectId/translations', authenticate, async (c) => {
    await requireProjectRole(c.var.user.userId, c.req.param('projectId'), Role.READER)
    const query = TranslationQuerySchema.parse(c.req.query())
    return c.json(await svc.listTranslations(c.req.param('projectId'), query))
  })

  app.get('/projects/:projectId/translations/:id', authenticate, async (c) => {
    await requireProjectRole(c.var.user.userId, c.req.param('projectId'), Role.READER)
    return c.json(await svc.getTranslation(c.req.param('projectId'), c.req.param('id')))
  })

  app.put('/projects/:projectId/keys/:keyId/translations/:localeId', authenticate, async (c) => {
    const membership = await requireProjectRole(c.var.user.userId, c.req.param('projectId'), Role.TRANSLATOR)
    const key = await keySvc.getKey(c.req.param('projectId'), c.req.param('keyId'))
    if (!canWriteNamespace(membership, key.namespaceId)) {
      throw Object.assign(new Error('Forbidden'), { statusCode: 403 })
    }
    // The locale must be this project's too, or a write here lands a row
    // pointing at another project's locale.
    await localeSvc.getLocale(c.req.param('projectId'), c.req.param('localeId'))
    const raw = await readBody<{ source?: unknown }>(c)
    const body = UpsertTranslationSchema.parse(raw)
    const t = await svc.upsertTranslation(
      c.req.param('keyId'),
      c.req.param('localeId'),
      body,
      c.var.user.userId,
      membership.role,
    )
    analytics.track('translation_saved', {
      userId: c.var.user.userId,
      props: {
        project_id: c.req.param('projectId'),
        locale_id: c.req.param('localeId'),
        source: typeof raw?.source === 'string' ? raw.source : 'manual',
      },
    })
    return c.json(t, 200)
  })

  app.get('/projects/:projectId/kanban', authenticate, async (c) => {
    await requireProjectRole(c.var.user.userId, c.req.param('projectId'), Role.READER)
    return c.json(await svc.listTranslationsForKanban(c.req.param('projectId')))
  })

  app.patch('/projects/:projectId/translations/:id/status', authenticate, async (c) => {
    const membership = await requireProjectRole(c.var.user.userId, c.req.param('projectId'), Role.TRANSLATOR)
    const body = UpdateTranslationStatusSchema.parse(await readBody(c))
    const translation = await svc.getTranslation(c.req.param('projectId'), c.req.param('id'))
    if (!canWriteNamespace(membership, translation.key.namespaceId)) {
      throw Object.assign(new Error('Forbidden'), { statusCode: 403 })
    }
    const result = await svc.updateStatus(
      c.req.param('projectId'),
      c.req.param('id'),
      body.status,
      membership.role,
      c.var.user.userId,
    )
    analytics.track('translation_status_changed', {
      userId: c.var.user.userId,
      props: {
        project_id: c.req.param('projectId'),
        translation_id: c.req.param('id'),
        to_status: body.status,
      },
    })
    return c.json(result)
  })

  app.patch('/projects/:projectId/translations/:translationId/assign', authenticate, async (c) => {
    const membership = await requireProjectRole(c.var.user.userId, c.req.param('projectId'), Role.TRANSLATOR)
    const body = AssignTranslationSchema.parse(await readBody(c))
    return c.json(
      await svc.assignTranslation(
        c.req.param('projectId'),
        c.req.param('translationId'),
        body.assigneeId,
        membership.role,
        c.var.user.userId,
      ),
    )
  })
}
