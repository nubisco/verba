import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { requireProjectRole } from '../services/acl.service.js'
import * as analytics from '../services/analytics.service.js'
import { Role } from '../types.js'
import { prisma } from '../prisma.js'
import { extractPlaceholders, validatePlaceholders } from '@nubisco/verba-shared'
import { getProjectAiConfig, translateString, buildTranslationPrompt } from '../services/ai.service.js'
import { upsertTranslation } from '../services/translation.service.js'

const SuggestBodySchema = z.object({
  keyId: z.string().min(1),
  localeCode: z.string().min(1),
})

const FillLocaleBodySchema = z.object({
  localeCode: z.string().min(1),
  namespaceId: z.string().optional(),
  onlyEmpty: z.boolean().optional().default(true),
  limit: z.number().int().min(1).max(500).optional().default(200),
})

export async function aiRoutes(app: FastifyInstance) {
  app.post<{ Params: { projectId: string } }>(
    '/projects/:projectId/ai/suggest',
    { preHandler: [app.authenticate] },
    async (req) => {
      await requireProjectRole(req.user.userId, req.params.projectId, Role.TRANSLATOR)

      const { projectId } = req.params
      const { keyId, localeCode } = SuggestBodySchema.parse(req.body)
      const aiStartedAt = Date.now()
      analytics.track('ai_translation_requested', {
        userId: req.user.userId,
        props: { project_id: projectId, locale: localeCode },
      })

      const project = await prisma.project.findUnique({ where: { id: projectId } })
      if (!project) throw Object.assign(new Error('Project not found'), { statusCode: 404 })
      const config = getProjectAiConfig(project)

      const key = await prisma.key.findFirst({
        where: { id: keyId, projectId },
        include: {
          namespace: { select: { slug: true } },
          translations: {
            where: { deletedAt: null },
            include: { locale: { select: { code: true, name: true } } },
          },
        },
      })
      if (!key) throw Object.assign(new Error('Key not found'), { statusCode: 404 })

      const targetLocale = await prisma.locale.findFirst({ where: { projectId, code: localeCode } })
      if (!targetLocale) throw Object.assign(new Error('Locale not found'), { statusCode: 404 })

      const existingTranslations = key.translations
        .filter((t) => t.locale.code !== localeCode && t.text.trim())
        .map((t) => `${t.locale.code}: "${t.text}"`)
        .slice(0, 5)
        .join('\n')

      const source = key.translations.find((t) => t.text.trim())?.text ?? ''
      const prompt =
        buildTranslationPrompt({
          source,
          targetLanguageName: targetLocale.name,
          targetLanguageCode: localeCode,
          keyLabel: `${key.namespace.slug}.${key.name}`,
          note: key.description ?? undefined,
          placeholders: extractPlaceholders(source)
            .filter((p) => !p.literal)
            .map((p) => p.raw),
        }) + (existingTranslations ? `\nExisting translations for reference:\n${existingTranslations}` : '')

      const suggestion = await translateString(config, prompt)

      analytics.track('ai_translation_completed', {
        userId: req.user.userId,
        props: {
          project_id: projectId,
          locale: localeCode,
          provider: project.aiProvider,
          duration_ms: Date.now() - aiStartedAt,
        },
      })
      return { suggestion }
    },
  )

  // Batch-fill a whole locale from source strings, with placeholder safety.
  app.post<{ Params: { projectId: string } }>(
    '/projects/:projectId/ai/fill-locale',
    { preHandler: [app.authenticate] },
    async (req) => {
      await requireProjectRole(req.user.userId, req.params.projectId, Role.TRANSLATOR)
      const { projectId } = req.params
      const { localeCode, namespaceId, onlyEmpty, limit } = FillLocaleBodySchema.parse(req.body)

      const project = await prisma.project.findUnique({ where: { id: projectId } })
      if (!project) throw Object.assign(new Error('Project not found'), { statusCode: 404 })
      const config = getProjectAiConfig(project)

      const targetLocale = await prisma.locale.findUnique({
        where: { projectId_code: { projectId, code: localeCode } },
      })
      if (!targetLocale) throw Object.assign(new Error('Locale not found'), { statusCode: 404 })

      // Source language: from the imported XLIFF skeleton if present, else "en".
      const skeleton = await prisma.xliffSkeleton.findUnique({
        where: { projectId_targetLanguage: { projectId, targetLanguage: localeCode } },
        select: { sourceLanguage: true },
      })
      const sourceCode = skeleton?.sourceLanguage ?? 'en'
      const sourceLocale = await prisma.locale.findUnique({
        where: { projectId_code: { projectId, code: sourceCode } },
      })
      if (!sourceLocale) throw Object.assign(new Error(`Source locale "${sourceCode}" not found`), { statusCode: 400 })

      const keys = await prisma.key.findMany({
        where: { projectId, deletedAt: null, ...(namespaceId ? { namespaceId } : {}) },
        include: {
          namespace: { select: { slug: true } },
          translations: {
            where: { localeId: { in: [sourceLocale.id, targetLocale.id] }, deletedAt: null },
            select: { text: true, localeId: true },
          },
        },
        take: limit,
      })

      let filled = 0
      let skipped = 0
      const warnings: { key: string; message: string }[] = []

      for (const key of keys) {
        const source = key.translations.find((t) => t.localeId === sourceLocale.id)?.text ?? ''
        const target = key.translations.find((t) => t.localeId === targetLocale.id)?.text ?? ''
        if (!source.trim()) {
          skipped++
          continue
        }
        if (onlyEmpty && target.trim()) {
          skipped++
          continue
        }

        const placeholders = extractPlaceholders(source)
          .filter((p) => !p.literal)
          .map((p) => p.raw)
        const prompt = buildTranslationPrompt({
          source,
          targetLanguageName: targetLocale.name,
          targetLanguageCode: localeCode,
          keyLabel: `${key.namespace.slug}.${key.name}`,
          note: key.description ?? undefined,
          placeholders,
        })

        let suggestion: string
        try {
          suggestion = await translateString(config, prompt)
        } catch (err) {
          warnings.push({ key: key.name, message: err instanceof Error ? err.message : String(err) })
          skipped++
          continue
        }

        // Enforce placeholder integrity: never write a corrupting translation.
        const validation = validatePlaceholders(source, suggestion)
        if (!suggestion.trim() || !validation.ok) {
          warnings.push({
            key: key.name,
            message: validation.ok ? 'Empty AI response' : validation.errors.join('; '),
          })
          skipped++
          continue
        }

        await upsertTranslation(key.id, targetLocale.id, { text: suggestion }, req.user.userId)
        filled++
      }

      return { filled, skipped, warnings }
    },
  )
}
