import type { Api, Ctx } from '../http.js'
import { authenticate } from '../session.js'
import { requireProjectRole } from '../services/acl.service.js'
import * as analytics from '../services/analytics.service.js'
import { exportLocale, exportTranslations } from '../services/export.service.js'
import { exportXliff } from '../services/xliff.service.js'
import { Role } from '../types.js'
import { z } from 'zod'

const ExportQuerySchema = z.object({
  format: z.enum(['json', 'csv', 'xlsx', 'xliff']).default('json'),
  locale: z.string().optional(),
  status: z.string().optional(),
  resolve: z.coerce.boolean().optional().default(false),
  splitByNamespace: z.coerce.boolean().optional().default(false),
})

/** A file to download, with its type and name. */
function download(c: Ctx, data: string | Uint8Array, contentType: string, filename: string) {
  c.header('Content-Type', contentType)
  c.header('Content-Disposition', `attachment; filename="${filename}"`)
  return c.body(typeof data === 'string' ? data : new Uint8Array(data))
}

export function exportRoutes(app: Api) {
  // `/export/<locale>.json`. Hono reads `:localeCode.json` as one parameter
  // named "localeCode.json", so the suffix is matched by pattern and removed.
  app.get('/projects/:projectId/export/:file{[^/]+\\.json}', authenticate, async (c) => {
    const localeCode = c.req.param('file').slice(0, -'.json'.length)
    await requireProjectRole(c.var.user.userId, c.req.param('projectId'), Role.READER)
    const data = await exportLocale(c.req.param('projectId'), localeCode)
    analytics.track('export_completed', {
      userId: c.var.user.userId,
      props: {
        project_id: c.req.param('projectId'),
        format: 'json',
        locale: localeCode,
      },
    })
    return download(c, JSON.stringify(data, null, 2), 'application/json; charset=utf-8', `${localeCode}.json`)
  })

  app.get('/projects/:projectId/export', authenticate, async (c) => {
    await requireProjectRole(c.var.user.userId, c.req.param('projectId'), Role.READER)
    const opts = ExportQuerySchema.parse(c.req.query())
    const format = opts.format
    analytics.track('export_completed', {
      userId: c.var.user.userId,
      props: {
        project_id: c.req.param('projectId'),
        format: opts.format,
        locale: opts.locale,
        status_filter: opts.status,
      },
    })

    if (format === 'xliff') {
      if (!opts.locale) throw Object.assign(new Error('locale is required for XLIFF export'), { statusCode: 400 })
      const xliff = await exportXliff(c.req.param('projectId'), opts.locale)
      return download(c, xliff.data, xliff.contentType, xliff.filename)
    }

    const result = await exportTranslations(c.req.param('projectId'), { ...opts, format })
    return download(c, result.data, result.contentType, result.filename)
  })
}
