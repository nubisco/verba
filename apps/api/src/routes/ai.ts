import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { requireProjectRole } from '../services/acl.service.js'
import { Role } from '../types.js'
import { prisma } from '../prisma.js'
import { decrypt, isEncrypted } from '../services/encryption.service.js'

const SuggestBodySchema = z.object({
  keyId: z.string().min(1),
  localeCode: z.string().min(1),
})

export async function aiRoutes(app: FastifyInstance) {
  app.post<{ Params: { projectId: string } }>(
    '/projects/:projectId/ai/suggest',
    { preHandler: [app.authenticate] },
    async (req) => {
      await requireProjectRole(req.user.userId, req.params.projectId, Role.TRANSLATOR)

      const { projectId } = req.params
      const { keyId, localeCode } = SuggestBodySchema.parse(req.body)

      // Load project AI config
      const project = await prisma.project.findUnique({
        where: { id: projectId },
      })
      if (!project) throw Object.assign(new Error('Project not found'), { statusCode: 404 })
      if (!project.aiEnabled || !project.aiApiKey || !project.aiProvider) {
        throw Object.assign(new Error('AI is not configured for this project'), {
          statusCode: 422,
        })
      }
      const apiKey = isEncrypted(project.aiApiKey) ? decrypt(project.aiApiKey) : project.aiApiKey

      // Load key with existing translations
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

      // Find target locale
      const targetLocale = await prisma.locale.findFirst({
        where: { projectId, code: localeCode },
      })
      if (!targetLocale) throw Object.assign(new Error('Locale not found'), { statusCode: 404 })

      // Build context from existing non-empty translations (excluding target)
      const existingTranslations = key.translations
        .filter((t) => t.locale.code !== localeCode && t.text.trim())
        .map((t) => `${t.locale.code}: "${t.text}"`)
        .slice(0, 5)
        .join('\n')

      const prompt =
        `You are a professional i18n translator. Translate the following UI string to ${targetLocale.name} (${localeCode}).\n` +
        `Key: ${key.namespace.slug}.${key.name}\n` +
        (existingTranslations ? `Existing translations for reference:\n${existingTranslations}\n` : '') +
        `Provide ONLY the translated string, no explanation, no quotes.`

      let suggestion: string

      if (project.aiProvider === 'openai') {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: project.aiModel || 'gpt-4o-mini',
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 512,
            temperature: 0.3,
          }),
        })
        if (!response.ok) {
          const err = await response.json().catch(() => ({}))
          throw Object.assign(
            new Error((err as { error?: { message?: string } }).error?.message ?? 'OpenAI request failed'),
            { statusCode: 502 },
          )
        }
        const data = (await response.json()) as {
          choices: Array<{ message: { content: string } }>
        }
        suggestion = data.choices[0]?.message?.content?.trim() ?? ''
      } else if (project.aiProvider === 'anthropic') {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: project.aiModel || 'claude-3-haiku-20240307',
            max_tokens: 512,
            messages: [{ role: 'user', content: prompt }],
          }),
        })
        if (!response.ok) {
          const err = await response.json().catch(() => ({}))
          throw Object.assign(
            new Error((err as { error?: { message?: string } }).error?.message ?? 'Anthropic request failed'),
            { statusCode: 502 },
          )
        }
        const data = (await response.json()) as {
          content: Array<{ text: string }>
        }
        suggestion = data.content[0]?.text?.trim() ?? ''
      } else if (project.aiProvider === 'gemini') {
        const model = project.aiModel || 'gemini-2.0-flash-lite'
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { maxOutputTokens: 512, temperature: 0.3 },
            }),
          },
        )
        if (!response.ok) {
          const err = await response.json().catch(() => ({}))
          const msg = (err as { error?: { message?: string } }).error?.message ?? 'Gemini request failed'
          throw Object.assign(new Error(msg), { statusCode: 502 })
        }
        const data = (await response.json()) as {
          candidates: Array<{ content: { parts: Array<{ text: string }> } }>
        }
        suggestion = data.candidates[0]?.content?.parts[0]?.text?.trim() ?? ''
      } else {
        throw Object.assign(new Error(`Unsupported AI provider: ${project.aiProvider}`), {
          statusCode: 422,
        })
      }

      return { suggestion }
    },
  )
}
