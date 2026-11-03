import { readBody, type Api } from '../http.js'
import { authenticate } from '../session.js'
import { requireProjectRole } from '../services/acl.service.js'
import * as analytics from '../services/analytics.service.js'
import { Role } from '../types.js'
import {
  FillLocaleBodySchema,
  PreviewBodySchema,
  SaveAiSettingsSchema,
  SuggestBodySchema,
} from '../schemas/ai.schema.js'
import { getAiSettings, getUsageSummary, saveAiSettings } from '../services/ai-settings.service.js'
import { fillLocale, previewTranslation, suggestTranslation } from '../services/ai-translation.service.js'

export function aiRoutes(app: Api) {
  // ─── Settings: admin only (AGENTS.md, "AI briefings") ──────────────────────

  app.get('/projects/:projectId/ai/settings', authenticate, async (c) => {
    await requireProjectRole(c.var.user.userId, c.req.param('projectId'), Role.ADMIN)
    return c.json({ settings: await getAiSettings(c.req.param('projectId')) })
  })

  app.put('/projects/:projectId/ai/settings', authenticate, async (c) => {
    await requireProjectRole(c.var.user.userId, c.req.param('projectId'), Role.ADMIN)
    const body = SaveAiSettingsSchema.parse(await readBody(c))
    return c.json({ settings: await saveAiSettings(c.req.param('projectId'), body, c.var.user.userId) })
  })

  app.get('/projects/:projectId/ai/usage', authenticate, async (c) => {
    await requireProjectRole(c.var.user.userId, c.req.param('projectId'), Role.ADMIN)
    return c.json({ usage: await getUsageSummary(c.req.param('projectId')) })
  })

  // One string translated and checked as a suggestion would be. Writes nothing.
  app.post('/projects/:projectId/ai/preview', authenticate, async (c) => {
    await requireProjectRole(c.var.user.userId, c.req.param('projectId'), Role.ADMIN)
    const { source, localeCode } = PreviewBodySchema.parse(await readBody(c))
    const result = await previewTranslation(c.req.param('projectId'), source, localeCode)
    return c.json(
      result.suggestion === null ? { suggestion: null, rejected: result.rejected } : { suggestion: result.suggestion },
    )
  })

  // ─── Suggestions ───────────────────────────────────────────────────────────

  app.post('/projects/:projectId/ai/suggest', authenticate, async (c) => {
    await requireProjectRole(c.var.user.userId, c.req.param('projectId'), Role.TRANSLATOR)
    const projectId = c.req.param('projectId')
    const { keyId, localeCode } = SuggestBodySchema.parse(await readBody(c))
    const startedAt = Date.now()
    analytics.track('ai_translation_requested', {
      userId: c.var.user.userId,
      props: { project_id: projectId, locale: localeCode },
    })

    const result = await suggestTranslation(projectId, keyId, localeCode)

    analytics.track('ai_translation_completed', {
      userId: c.var.user.userId,
      props: {
        project_id: projectId,
        locale: localeCode,
        provider: result.provider,
        rejected: result.suggestion === null,
        duration_ms: Date.now() - startedAt,
      },
    })
    return c.json(
      result.suggestion === null ? { suggestion: null, rejected: result.rejected } : { suggestion: result.suggestion },
    )
  })

  // Batch-fill a whole locale from source strings. Every translation is checked before it is written.
  app.post('/projects/:projectId/ai/fill-locale', authenticate, async (c) => {
    const membership = await requireProjectRole(c.var.user.userId, c.req.param('projectId'), Role.TRANSLATOR)
    const body = FillLocaleBodySchema.parse(await readBody(c))
    const { filled, skipped, warnings } = await fillLocale(
      c.req.param('projectId'),
      body,
      c.var.user.userId,
      membership.role,
    )
    return c.json({ filled, skipped, warnings })
  })
}
