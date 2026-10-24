import { prisma } from '../prisma.js'
import {
  buildTranslationFacts,
  buildTranslationUserPrompt,
  callModel,
  checkSuggestion,
  TRANSLATION_SYSTEM_PROMPT,
  type AiConfig,
  type TranslationFacts,
} from './ai.service.js'
import { recordUsage, resolveAiConfig, type UsageSource } from './ai-settings.service.js'
import { upsertTranslation } from './translation.service.js'

// AI translation suggestions: the facts come from the project, the model only
// writes the words, and its words are checked before anybody sees them
// (AGENTS.md, "AI features").

function httpError(message: string, statusCode: number): Error {
  return Object.assign(new Error(message), { statusCode })
}

export type SuggestionResult =
  | { suggestion: string; provider: string }
  | { suggestion: null; rejected: string; provider: string }

/** Ask the model for one string, log what it cost, and check its answer against the facts. */
async function translate(
  projectId: string,
  config: AiConfig,
  facts: TranslationFacts,
  source: UsageSource,
): Promise<{ ok: true; text: string } | { ok: false; reason: string }> {
  const reply = await callModel(config, TRANSLATION_SYSTEM_PROMPT, buildTranslationUserPrompt(facts))
  await recordUsage(projectId, config, source, reply.usage)
  return checkSuggestion(facts, reply.text)
}

/** One suggestion for one key and locale. A suggestion that fails the check is not returned. */
export async function suggestTranslation(
  projectId: string,
  keyId: string,
  localeCode: string,
): Promise<SuggestionResult> {
  const config = await resolveAiConfig(projectId)

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
  if (!key) throw httpError('Key not found', 404)

  const targetLocale = await prisma.locale.findFirst({ where: { projectId, code: localeCode } })
  if (!targetLocale) throw httpError('Locale not found', 404)

  const others = key.translations.filter((t) => t.locale.code !== localeCode && t.text.trim())
  const sourceRow = others[0]
  if (!sourceRow) throw httpError('This key has no text in another locale to translate from', 422)

  const facts = buildTranslationFacts({
    source: sourceRow.text,
    sourceLanguage: sourceRow.locale.code,
    targetLanguage: { code: localeCode, name: targetLocale.name },
    key: `${key.namespace.slug}.${key.name}`,
    developerNote: key.description ?? undefined,
    otherTranslations: others.slice(1, 5).map((t) => ({ locale: t.locale.code, text: t.text })),
  })

  const checked = await translate(projectId, config, facts, 'suggest')
  return checked.ok
    ? { suggestion: checked.text, provider: config.provider }
    : { suggestion: null, rejected: checked.reason, provider: config.provider }
}

export interface FillLocaleInput {
  localeCode: string
  namespaceId?: string
  onlyEmpty: boolean
  limit: number
}

/** Fill a locale from its source strings. A translation that fails the check is skipped, never written. */
export async function fillLocale(projectId: string, input: FillLocaleInput, userId: string, role: string) {
  const config = await resolveAiConfig(projectId)
  const { localeCode, namespaceId, onlyEmpty, limit } = input

  const targetLocale = await prisma.locale.findUnique({
    where: { projectId_code: { projectId, code: localeCode } },
  })
  if (!targetLocale) throw httpError('Locale not found', 404)

  // Source language: from the imported XLIFF skeleton if present, else "en".
  const skeleton = await prisma.xliffSkeleton.findUnique({
    where: { projectId_targetLanguage: { projectId, targetLanguage: localeCode } },
    select: { sourceLanguage: true },
  })
  const sourceCode = skeleton?.sourceLanguage ?? 'en'
  const sourceLocale = await prisma.locale.findUnique({
    where: { projectId_code: { projectId, code: sourceCode } },
  })
  if (!sourceLocale) throw httpError(`Source locale "${sourceCode}" not found`, 400)

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
    if (!source.trim() || (onlyEmpty && target.trim())) {
      skipped++
      continue
    }

    const facts = buildTranslationFacts({
      source,
      sourceLanguage: sourceCode,
      targetLanguage: { code: localeCode, name: targetLocale.name },
      key: `${key.namespace.slug}.${key.name}`,
      developerNote: key.description ?? undefined,
    })

    let checked: Awaited<ReturnType<typeof translate>>
    try {
      checked = await translate(projectId, config, facts, 'fill')
    } catch (err) {
      warnings.push({ key: key.name, message: err instanceof Error ? err.message : String(err) })
      skipped++
      continue
    }
    if (!checked.ok) {
      warnings.push({ key: key.name, message: checked.reason })
      skipped++
      continue
    }

    await upsertTranslation(key.id, targetLocale.id, { text: checked.text }, userId, role)
    filled++
  }

  return { filled, skipped, warnings, provider: config.provider }
}

/**
 * The preview in project settings: one string the admin types, translated and
 * checked exactly as a suggestion is. It writes nothing, and runs even while
 * suggestions are switched off, so the key can be tried before it is used.
 */
export async function previewTranslation(
  projectId: string,
  source: string,
  localeCode: string,
): Promise<SuggestionResult> {
  const config = await resolveAiConfig(projectId, { evenWhenOff: true })
  const targetLocale = await prisma.locale.findFirst({ where: { projectId, code: localeCode } })
  if (!targetLocale) throw httpError('Locale not found', 404)
  const facts = buildTranslationFacts({
    source,
    targetLanguage: { code: localeCode, name: targetLocale.name },
    key: 'settings.preview',
  })
  const checked = await translate(projectId, config, facts, 'preview')
  return checked.ok
    ? { suggestion: checked.text, provider: config.provider }
    : { suggestion: null, rejected: checked.reason, provider: config.provider }
}
