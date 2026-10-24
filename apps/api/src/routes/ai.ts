import type { FastifyInstance } from 'fastify'
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

export async function aiRoutes(app: FastifyInstance) {
  // ─── Settings: admin only (AGENTS.md, "AI briefings") ──────────────────────

  app.get<{ Params: { projectId: string } }>(
    '/projects/:projectId/ai/settings',
    { preHandler: [app.authenticate] },
    async (req) => {
      await requireProjectRole(req.user.userId, req.params.projectId, Role.ADMIN)
      return { settings: await getAiSettings(req.params.projectId) }
    },
  )

  app.put<{ Params: { projectId: string } }>(
    '/projects/:projectId/ai/settings',
    { preHandler: [app.authenticate] },
    async (req) => {
      await requireProjectRole(req.user.userId, req.params.projectId, Role.ADMIN)
      const body = SaveAiSettingsSchema.parse(req.body)
      return { settings: await saveAiSettings(req.params.projectId, body, req.user.userId) }
    },
  )

  app.get<{ Params: { projectId: string } }>(
    '/projects/:projectId/ai/usage',
    { preHandler: [app.authenticate] },
    async (req) => {
      await requireProjectRole(req.user.userId, req.params.projectId, Role.ADMIN)
      return { usage: await getUsageSummary(req.params.projectId) }
    },
  )

  // One string translated and checked as a suggestion would be. Writes nothing.
  app.post<{ Params: { projectId: string } }>(
    '/projects/:projectId/ai/preview',
    { preHandler: [app.authenticate] },
    async (req) => {
      await requireProjectRole(req.user.userId, req.params.projectId, Role.ADMIN)
      const { source, localeCode } = PreviewBodySchema.parse(req.body)
      const result = await previewTranslation(req.params.projectId, source, localeCode)
      return result.suggestion === null
        ? { suggestion: null, rejected: result.rejected }
        : { suggestion: result.suggestion }
    },
  )

  // ─── Suggestions ───────────────────────────────────────────────────────────

  app.post<{ Params: { projectId: string } }>(
    '/projects/:projectId/ai/suggest',
    { preHandler: [app.authenticate] },
    async (req) => {
      await requireProjectRole(req.user.userId, req.params.projectId, Role.TRANSLATOR)
      const { projectId } = req.params
      const { keyId, localeCode } = SuggestBodySchema.parse(req.body)
      const startedAt = Date.now()
      analytics.track('ai_translation_requested', {
        userId: req.user.userId,
        props: { project_id: projectId, locale: localeCode },
      })

      const result = await suggestTranslation(projectId, keyId, localeCode)

      analytics.track('ai_translation_completed', {
        userId: req.user.userId,
        props: {
          project_id: projectId,
          locale: localeCode,
          provider: result.provider,
          rejected: result.suggestion === null,
          duration_ms: Date.now() - startedAt,
        },
      })
      return result.suggestion === null
        ? { suggestion: null, rejected: result.rejected }
        : { suggestion: result.suggestion }
    },
  )

  // Batch-fill a whole locale from source strings. Every translation is checked before it is written.
  app.post<{ Params: { projectId: string } }>(
    '/projects/:projectId/ai/fill-locale',
    { preHandler: [app.authenticate] },
    async (req) => {
      const membership = await requireProjectRole(req.user.userId, req.params.projectId, Role.TRANSLATOR)
      const body = FillLocaleBodySchema.parse(req.body)
      const { filled, skipped, warnings } = await fillLocale(
        req.params.projectId,
        body,
        req.user.userId,
        membership.role,
      )
      return { filled, skipped, warnings }
    },
  )
}
