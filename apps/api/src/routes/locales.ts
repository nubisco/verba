import { readBody, type Api } from '../http.js'
import { authenticate } from '../session.js'
import { CreateLocaleSchema, UpdateLocaleSchema } from '../schemas/locale.schema.js'
import * as svc from '../services/locale.service.js'
import * as analytics from '../services/analytics.service.js'
import { requireProjectRole } from '../services/acl.service.js'
import { Role } from '../types.js'

export function localeRoutes(app: Api) {
  app.get('/projects/:projectId/locales', authenticate, async (c) => {
    await requireProjectRole(c.var.user.userId, c.req.param('projectId'), Role.READER)
    return c.json(await svc.listLocales(c.req.param('projectId')))
  })

  app.post('/projects/:projectId/locales', authenticate, async (c) => {
    await requireProjectRole(c.var.user.userId, c.req.param('projectId'), Role.MAINTAINER)
    const body = CreateLocaleSchema.parse(await readBody(c))
    const locale = await svc.createLocale(c.req.param('projectId'), body)
    analytics.track('locale_added', {
      userId: c.var.user.userId,
      props: { project_id: c.req.param('projectId'), locale: locale.code },
    })
    return c.json(locale, 201)
  })

  app.get('/projects/:projectId/locales/:id', authenticate, async (c) => {
    await requireProjectRole(c.var.user.userId, c.req.param('projectId'), Role.READER)
    return c.json(await svc.getLocale(c.req.param('projectId'), c.req.param('id')))
  })

  app.patch('/projects/:projectId/locales/:id', authenticate, async (c) => {
    await requireProjectRole(c.var.user.userId, c.req.param('projectId'), Role.MAINTAINER)
    const body = UpdateLocaleSchema.parse(await readBody(c))
    return c.json(await svc.updateLocale(c.req.param('projectId'), c.req.param('id'), body))
  })

  app.delete('/projects/:projectId/locales/:id', authenticate, async (c) => {
    await requireProjectRole(c.var.user.userId, c.req.param('projectId'), Role.MAINTAINER)
    await svc.deleteLocale(c.req.param('projectId'), c.req.param('id'))
    analytics.track('locale_removed', {
      userId: c.var.user.userId,
      props: { project_id: c.req.param('projectId') },
    })
    return c.body(null, 204)
  })
}
