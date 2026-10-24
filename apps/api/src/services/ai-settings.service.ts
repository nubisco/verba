import { prisma } from '../prisma.js'
import * as audit from './audit.service.js'
import { DEFAULT_MODELS, isProvider, type AiConfig, type AiProvider, type TokenUsage } from './ai.service.js'
import { aiEncryptionConfigured, AiKeyStorageError, encrypt, openStoredKey } from './encryption.service.js'
import { getPriceList, priceFor, type PriceList } from './ai-prices.service.js'

// A project's AI settings: its own provider key, and what it has cost.
//
// Bring your own key, never ours (AGENTS.md, "AI features"). There is no
// server key to fall back to: with no key stored, AI suggestions are off and
// translating by hand works as it always did.

function httpError(message: string, statusCode: number): Error {
  return Object.assign(new Error(message), { statusCode })
}

/** What the settings page is told. Never carries the key, only whether one is stored. */
export interface AiSettings {
  enabled: boolean
  provider: AiProvider
  /** Null means the provider default. */
  model: string | null
  hasKey: boolean
  /** A key is stored but this server cannot open it (the secret changed), so it must be entered again. */
  keyUnreadable: boolean
  /** Whether this server can store a key at all (AI_ENCRYPTION_KEY is set). */
  canStoreKey: boolean
  defaultModels: Record<AiProvider, string>
  updatedAt: string | null
}

interface AiRow {
  aiEnabled: boolean
  aiProvider: string | null
  aiApiKey: string | null
  aiModel: string | null
  aiUpdatedAt: Date | null
}

const AI_SELECT = { aiEnabled: true, aiProvider: true, aiApiKey: true, aiModel: true, aiUpdatedAt: true } as const

async function readRow(projectId: string): Promise<AiRow> {
  const row = await prisma.project.findUnique({ where: { id: projectId }, select: AI_SELECT })
  if (!row) throw httpError('Project not found', 404)
  return row
}

export async function getAiSettings(projectId: string): Promise<AiSettings> {
  const row = await readRow(projectId)
  const opened = row.aiApiKey ? await openStoredKey(row.aiApiKey) : null
  return {
    enabled: row.aiEnabled,
    provider: isProvider(row.aiProvider) ? row.aiProvider : 'anthropic',
    model: row.aiModel || null,
    hasKey: Boolean(row.aiApiKey),
    // Unreadable also covers a key from an earlier version on a server with no
    // AI_ENCRYPTION_KEY: it is kept, but cannot be used until it is re-sealed.
    keyUnreadable: Boolean(row.aiApiKey) && (!opened || (opened.legacy && !aiEncryptionConfigured())),
    canStoreKey: aiEncryptionConfigured(),
    defaultModels: DEFAULT_MODELS,
    updatedAt: row.aiUpdatedAt ? row.aiUpdatedAt.toISOString() : null,
  }
}

export interface SaveAiSettingsInput {
  /** Omitted keeps the stored value. */
  enabled?: boolean
  /** Omitted keeps the stored provider. */
  provider?: AiProvider
  /** Omitted keeps the stored model. Null or blank means the provider default. */
  model?: string | null
  /**
   * Omitted (or blank) keeps the stored key, which is what saving only the
   * model or the switch sends. An explicit null removes it.
   */
  apiKey?: string | null
}

export async function saveAiSettings(
  projectId: string,
  input: SaveAiSettingsInput,
  userId: string,
): Promise<AiSettings> {
  const before = await getAiSettings(projectId)
  const data: Partial<AiRow> = { aiUpdatedAt: new Date() }

  if (input.enabled !== undefined) data.aiEnabled = input.enabled
  if (input.provider !== undefined) data.aiProvider = input.provider
  if (input.model !== undefined) data.aiModel = input.model?.trim() || null

  if (input.apiKey === null) {
    data.aiApiKey = null
  } else if (typeof input.apiKey === 'string' && input.apiKey.trim()) {
    const raw = input.apiKey.trim()
    // A shape check, not a validity check. Whether the key works is found out
    // on the first suggestion, where the provider's error names the key.
    if (raw.length < 12) throw httpError('That does not look like a provider API key', 400)
    try {
      // Whatever a client sends is sealed, including something shaped like
      // ciphertext: storing it as sent would let a client plant a value.
      data.aiApiKey = await encrypt(raw)
    } catch (error) {
      if (error instanceof AiKeyStorageError) throw httpError(error.message, 503)
      throw error
    }
  }

  await prisma.project.update({ where: { id: projectId }, data })
  const after = await getAiSettings(projectId)

  // The key itself never goes into the audit log, only whether there is one.
  const summary = (s: AiSettings) => ({ enabled: s.enabled, provider: s.provider, model: s.model, hasKey: s.hasKey })
  await audit.log({
    projectId,
    userId,
    action: 'ai_settings.updated',
    entityType: 'project',
    entityId: projectId,
    before: summary(before),
    after: summary(after),
  })
  return after
}

/**
 * The credentials a suggestion will use: the project's own key, or a refusal
 * that says why. A key stored in an earlier format is sealed again in the
 * current one on the way through, when this server has a secret.
 */
export async function resolveAiConfig(projectId: string, opts: { evenWhenOff?: boolean } = {}): Promise<AiConfig> {
  const row = await readRow(projectId)
  if (!row.aiApiKey) throw httpError('No AI key is stored for this project', 422)
  // A preview in settings may run before suggestions are switched on, so an admin can try the key first.
  if (!row.aiEnabled && !opts.evenWhenOff) throw httpError('AI suggestions are switched off for this project', 422)
  const opened = await openStoredKey(row.aiApiKey)
  if (!opened) {
    throw httpError('The AI key for this project can no longer be read. An admin must enter it again.', 422)
  }
  // A key from an earlier version is used only once it is sealed in the
  // current format. Without AI_ENCRYPTION_KEY it stays stored, untouched.
  if (opened.legacy && !(await resealKey(projectId, row.aiApiKey, opened.apiKey))) {
    throw httpError(
      "This project's AI key was saved by an earlier version of Verba and is re-encrypted once the server has AI_ENCRYPTION_KEY. Ask the person who runs Verba to set it.",
      503,
    )
  }
  const provider = isProvider(row.aiProvider) ? row.aiProvider : 'anthropic'
  return { provider, model: row.aiModel || DEFAULT_MODELS[provider], apiKey: opened.apiKey }
}

/** Seal a legacy key in the current format. Never throws, and never drops the stored key. */
async function resealKey(projectId: string, stored: string, apiKey: string): Promise<boolean> {
  if (!aiEncryptionConfigured()) return false
  try {
    const sealed = await encrypt(apiKey)
    // Only replaces the value that was read, so a key saved meanwhile is not overwritten.
    const { count } = await prisma.project.updateMany({
      where: { id: projectId, aiApiKey: stored },
      data: { aiApiKey: sealed },
    })
    return count > 0
  } catch (error) {
    console.error('AI key reseal failed:', (error as Error).message)
    return false
  }
}

/**
 * Seal every stored key that is still in an earlier format (plain text, or the
 * old node:crypto format under ENCRYPTION_KEY, JWT_SECRET or the old constant).
 * Run once at boot. A key that cannot be opened is left exactly as it is, so
 * nothing is lost: the settings page asks for it to be entered again.
 */
export async function migrateStoredAiKeys(): Promise<{ resealed: number; unreadable: number; waiting: number }> {
  const result = { resealed: 0, unreadable: 0, waiting: 0 }
  const rows = await prisma.project.findMany({
    where: { aiApiKey: { not: null } },
    select: { id: true, aiApiKey: true },
  })
  for (const row of rows) {
    if (!row.aiApiKey) continue
    const opened = await openStoredKey(row.aiApiKey)
    if (!opened) {
      result.unreadable++
      continue
    }
    if (!opened.legacy) continue
    if (await resealKey(row.id, row.aiApiKey, opened.apiKey)) result.resealed++
    else result.waiting++
  }
  return result
}

// ─── Usage ───────────────────────────────────────────────────────────────────

export type UsageSource = 'suggest' | 'fill' | 'preview'

/**
 * Log one request that reached the provider. Never throws: a failed write
 * costs a row in the usage report, and letting it propagate would cost the
 * translation that was already paid for.
 */
export async function recordUsage(
  projectId: string,
  config: Pick<AiConfig, 'provider' | 'model'>,
  source: UsageSource,
  usage: TokenUsage,
): Promise<void> {
  try {
    await prisma.aiUsage.create({
      data: {
        projectId,
        source,
        provider: config.provider,
        model: config.model,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
      },
    })
  } catch (error) {
    console.error('AI usage write failed:', (error as Error).message)
  }
}

/** Estimated USD for a token count, or null when the model has no known price. */
export function estimateCost(
  prices: PriceList | null,
  provider: string,
  model: string,
  usage: TokenUsage,
): number | null {
  const price = priceFor(prices, provider, model)
  if (!price) return null
  return usage.inputTokens * price.input + usage.outputTokens * price.output
}

/** The window usage is reported over, the same 30 days as every other product. */
export const USAGE_DAYS = 30

export interface UsageSummary {
  requests: number
  inputTokens: number
  outputTokens: number
  estimatedUsd: number | null
  unpricedModels: string[]
  /** The day the price list was fetched, YYYY-MM-DD, or empty when there has never been one. */
  pricingVerifiedOn: string
  days: number
}

export async function getUsageSummary(projectId: string, at: number = Date.now()): Promise<UsageSummary> {
  const since = new Date(at - USAGE_DAYS * 24 * 60 * 60 * 1000)
  const groups = await prisma.aiUsage.groupBy({
    by: ['provider', 'model'],
    where: { projectId, createdAt: { gt: since } },
    _count: { _all: true },
    _sum: { inputTokens: true, outputTokens: true },
  })

  const summary: UsageSummary = {
    requests: 0,
    inputTokens: 0,
    outputTokens: 0,
    estimatedUsd: 0,
    unpricedModels: [],
    pricingVerifiedOn: '',
    days: USAGE_DAYS,
  }
  // Prices are read only here, never in the AI call, so a slow fetch cannot hold up a suggestion.
  const prices = groups.length ? await getPriceList(at) : null
  summary.pricingVerifiedOn = prices ? new Date(prices.fetchedAt).toISOString().slice(0, 10) : ''

  for (const group of groups) {
    const usage = { inputTokens: group._sum.inputTokens ?? 0, outputTokens: group._sum.outputTokens ?? 0 }
    summary.requests += group._count._all
    summary.inputTokens += usage.inputTokens
    summary.outputTokens += usage.outputTokens
    const cost = estimateCost(prices, group.provider, group.model, usage)
    if (cost === null) {
      // One unpriced model makes the whole total a guess, so there is no total.
      if (!summary.unpricedModels.includes(group.model)) summary.unpricedModels.push(group.model)
      summary.estimatedUsd = null
    } else if (summary.estimatedUsd !== null) {
      summary.estimatedUsd += cost
    }
  }
  return summary
}
