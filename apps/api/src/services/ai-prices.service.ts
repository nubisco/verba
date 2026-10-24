import { prisma } from '../prisma.js'

/**
 * List prices for the cost estimate, fetched rather than kept here.
 *
 * Prices are fetched, never hard-coded (AGENTS.md, "AI features"). A table in
 * the code is right on the day somebody types it and wrong from the day a
 * provider changes a price, and nothing tells anybody. The source is LiteLLM's
 * public price list, which every Nubisco product reads the same way (Analytics'
 * ai-prices.ts, Acta's aiPrices.ts, Erigo's ai-prices.ts).
 *
 * The full file is about 3 MB and covers thousands of models on dozens of
 * hosts. Only the entries for the three providers Verba calls directly are
 * kept, a few hundred rows.
 */
export const PRICE_LIST_URL =
  'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json'

/** A copy younger than this is used as it is. */
export const PRICE_TTL_MS = 24 * 60 * 60 * 1000

/** After a failed refresh, the next attempt waits this long, so an outage is not refetched on every request. */
export const RETRY_AFTER_FAILURE_MS = 60 * 60 * 1000

/** How long one fetch may take before it counts as failed. */
export const FETCH_TIMEOUT_MS = 10_000

/** USD per token, which is LiteLLM's own unit. */
export interface ModelPrice {
  input: number
  output: number
}

export interface PriceList {
  fetchedAt: number
  /** Keyed `${provider}/${model}`, for example `gemini/gemini-3.5-flash-lite`. */
  prices: Record<string, ModelPrice>
}

/**
 * LiteLLM's name for each provider Verba calls directly.
 *
 * The same model id can appear several times in the file, once per host
 * (Bedrock, Vertex, Azure and so on), each at that host's price. Only the entry
 * for the provider's own API is the price the project pays, so entries are
 * matched on `litellm_provider` and never on the model name alone. The Gemini
 * API's prices are the `gemini/`-prefixed keys.
 */
const LITELLM_PROVIDER: Record<string, string> = {
  anthropic: 'anthropic',
  openai: 'openai',
  gemini: 'gemini',
}

function isPrice(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

/**
 * Keeps the entries Verba can use, under one spelling.
 *
 * Some keys carry the provider as a prefix (`gemini/gemini-3.5-flash-lite`) and
 * some do not (`claude-haiku-4-5`). Both are stored as `${provider}/${model}`,
 * so a lookup does not need to know which spelling the file happened to use.
 */
export function reducePriceList(raw: unknown): Record<string, ModelPrice> {
  const prices: Record<string, ModelPrice> = {}
  if (!raw || typeof raw !== 'object') return prices
  for (const [key, entry] of Object.entries(raw as Record<string, unknown>)) {
    if (!entry || typeof entry !== 'object') continue
    const { litellm_provider, input_cost_per_token, output_cost_per_token } = entry as Record<string, unknown>
    const provider = Object.keys(LITELLM_PROVIDER).find((name) => LITELLM_PROVIDER[name] === litellm_provider)
    if (!provider || !isPrice(input_cost_per_token) || !isPrice(output_cost_per_token)) continue
    const prefix = `${litellm_provider}/`
    const model = key.startsWith(prefix) ? key.slice(prefix.length) : key
    const id = `${provider}/${model}`
    if (!(id in prices)) prices[id] = { input: input_cost_per_token, output: output_cost_per_token }
  }
  return prices
}

/**
 * The price of one model as Verba stores it, or null when the list has none.
 *
 * The stored id is what an administrator typed or the default, so it may carry
 * the provider prefix itself, or the `models/` prefix Gemini's own API uses.
 */
export function priceFor(list: PriceList | null, provider: string, model: string): ModelPrice | null {
  if (!list) return null
  let name = model.trim()
  if (name.startsWith('models/')) name = name.slice('models/'.length)
  if (name.startsWith(`${provider}/`)) name = name.slice(provider.length + 1)
  return list.prices[`${provider}/${name}`] ?? null
}

/** The copy in memory. Null until the database has been read or a fetch has succeeded. */
let memory: PriceList | null = null
/** Read once per process. Shared, so concurrent first requests all wait for the same read. */
let dbLoad: Promise<void> | null = null
let inFlight: Promise<void> | null = null
let lastAttemptAt: number | null = null

/** Tests only: forget everything this process has cached. */
export function resetPriceCache(): void {
  memory = null
  dbLoad = null
  inFlight = null
  lastAttemptAt = null
}

async function loadFromDb(): Promise<void> {
  try {
    const stored = await prisma.aiPriceList.findUnique({ where: { id: 1 } })
    if (!stored) return
    const prices = JSON.parse(stored.prices) as Record<string, ModelPrice>
    const fetchedAt = stored.fetchedAt.getTime()
    if (!memory || memory.fetchedAt < fetchedAt) memory = { fetchedAt, prices }
  } catch (error) {
    console.error('stored price list unreadable:', (error as Error).message)
  }
}

/**
 * One fetch. Never throws: a failure keeps whatever copy there already is.
 *
 * A response that parses but yields no prices is treated as a failure too, so
 * a change to the file's format cannot replace a good copy with an empty one.
 */
async function refresh(at: number): Promise<void> {
  lastAttemptAt = at
  let fetched: PriceList
  try {
    const response = await fetch(PRICE_LIST_URL, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const prices = reducePriceList(await response.json())
    if (Object.keys(prices).length === 0) throw new Error('no usable prices in the list')
    fetched = { fetchedAt: at, prices }
    memory = fetched
  } catch (error) {
    console.error('price list fetch failed, keeping the last good copy:', (error as Error).message)
    return
  }
  try {
    const data = { prices: JSON.stringify(fetched.prices), fetchedAt: new Date(fetched.fetchedAt) }
    await prisma.aiPriceList.upsert({ where: { id: 1 }, create: { id: 1, ...data }, update: data })
  } catch (error) {
    // The copy in memory still serves this process. The next restart refetches.
    console.error('price list write failed:', (error as Error).message)
  }
}

/**
 * The price list for a cost estimate, or null when there has never been one.
 *
 * Read only by the usage summary, never by a translation request, so a slow or
 * failing fetch can never hold up a suggestion.
 *
 * - A copy younger than a day, in memory or in the database, is used as it is.
 *   A restart reads the database rather than refetching.
 * - A stale copy is returned at once, and a refresh starts behind it.
 * - With no copy at all, the request waits for one fetch, bounded by
 *   FETCH_TIMEOUT_MS, and gets null if it fails: usage then shows tokens and
 *   no cost.
 * - A failed fetch is not retried for RETRY_AFTER_FAILURE_MS, and concurrent
 *   requests share one fetch.
 */
export async function getPriceList(at: number = Date.now()): Promise<PriceList | null> {
  dbLoad ??= loadFromDb()
  await dbLoad
  if (memory && at - memory.fetchedAt < PRICE_TTL_MS) return memory

  const mayAttempt = lastAttemptAt === null || at - lastAttemptAt >= RETRY_AFTER_FAILURE_MS
  if (!inFlight && mayAttempt) {
    inFlight = refresh(at).finally(() => {
      inFlight = null
    })
  }

  if (memory) return memory
  if (inFlight) await inFlight
  return memory
}

/** Tests only: wait for a refresh started behind a stale copy. */
export async function settledPriceRefresh(): Promise<void> {
  if (inFlight) await inFlight
}
