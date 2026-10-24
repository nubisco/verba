import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  row: null as { id: number; prices: string; fetchedAt: Date } | null,
  writes: 0,
}))

vi.mock('../prisma.js', () => ({
  prisma: {
    aiPriceList: {
      findUnique: vi.fn(async () => state.row),
      upsert: vi.fn(async ({ create }: { create: { id: number; prices: string; fetchedAt: Date } }) => {
        state.writes += 1
        state.row = create
        return create
      }),
    },
  },
}))

import { prisma } from '../prisma.js'
import {
  getPriceList,
  priceFor,
  PRICE_LIST_URL,
  PRICE_TTL_MS,
  reducePriceList,
  resetPriceCache,
  RETRY_AFTER_FAILURE_MS,
  settledPriceRefresh,
} from '../services/ai-prices.service.js'
import { PRICE_LIST_EXCERPT, storedPriceRow } from './price-list-excerpt.js'

const AT = Date.UTC(2026, 9, 24, 12)
const HOUR = 60 * 60 * 1000

/** A changed list, so a test can tell a refetched copy from the stored one. */
const NEWER_LIST = {
  ...PRICE_LIST_EXCERPT,
  'claude-haiku-4-5': { ...PRICE_LIST_EXCERPT['claude-haiku-4-5'], input_cost_per_token: 4e-6 },
}

function respondWith(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

const fetchMock = vi.fn()

beforeEach(() => {
  resetPriceCache()
  state.row = null
  state.writes = 0
  fetchMock.mockReset()
  vi.mocked(prisma.aiPriceList.findUnique).mockClear()
  vi.stubGlobal('fetch', fetchMock)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('matching a stored model id to the list', () => {
  const list = { fetchedAt: AT, prices: reducePriceList(PRICE_LIST_EXCERPT) }

  it('finds the Anthropic default at the Anthropic API price', () => {
    expect(priceFor(list, 'anthropic', 'claude-haiku-4-5')).toEqual({ input: 1e-6, output: 5e-6 })
  })

  it('uses the Anthropic API price, never another host’s price for the same model', () => {
    expect(priceFor(list, 'anthropic', 'claude-opus-5')).toEqual({ input: 5e-6, output: 2.5e-5 })
  })

  it('finds a key the list spells with a provider prefix', () => {
    expect(priceFor(list, 'gemini', 'gemini-3.5-flash-lite')).toEqual({ input: 3e-7, output: 2.5e-6 })
  })

  it('accepts a stored id that itself carries the prefix, or Gemini’s models/ prefix', () => {
    expect(priceFor(list, 'gemini', 'gemini/gemini-3.5-flash-lite')).not.toBeNull()
    expect(priceFor(list, 'gemini', 'models/gemini-3.5-flash-lite')).not.toBeNull()
    expect(priceFor(list, 'anthropic', 'anthropic/claude-opus-5')).not.toBeNull()
  })

  it('finds the OpenAI default under its bare key', () => {
    expect(priceFor(list, 'openai', 'gpt-5.6-luna')).toEqual({ input: 2e-7, output: 1.2e-6 })
  })

  it('has nothing for an unknown model, or a model under the wrong provider', () => {
    expect(priceFor(list, 'anthropic', 'claude-not-released')).toBeNull()
    expect(priceFor(list, 'openai', 'claude-opus-5')).toBeNull()
  })

  it('keeps only the providers Verba calls, and only entries with a price', () => {
    expect(Object.keys(list.prices).sort()).toEqual([
      'anthropic/claude-haiku-4-5',
      'anthropic/claude-opus-5',
      'anthropic/claude-sonnet-5',
      'gemini/gemini-3.5-flash-lite',
      'openai/gpt-5.6-luna',
    ])
  })

  it('has nothing at all without a list', () => {
    expect(priceFor(null, 'anthropic', 'claude-haiku-4-5')).toBeNull()
  })
})

describe('the price list cache', () => {
  it('uses a fresh stored copy without fetching, so a restart does not refetch', async () => {
    state.row = storedPriceRow(AT - 2 * HOUR)
    const list = await getPriceList(AT)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(priceFor(list, 'anthropic', 'claude-haiku-4-5')?.input).toBe(1e-6)
  })

  it('reads the database once, then serves from memory', async () => {
    state.row = storedPriceRow(AT - 2 * HOUR)
    await getPriceList(AT)
    await getPriceList(AT + HOUR)
    expect(prisma.aiPriceList.findUnique).toHaveBeenCalledTimes(1)
  })

  it('refreshes a stale copy behind it, and stores the new one durably', async () => {
    fetchMock.mockResolvedValue(respondWith(NEWER_LIST))
    state.row = storedPriceRow(AT - PRICE_TTL_MS - HOUR)

    const stale = await getPriceList(AT)
    expect(priceFor(stale, 'anthropic', 'claude-haiku-4-5')?.input).toBe(1e-6)
    await settledPriceRefresh()

    expect(fetchMock).toHaveBeenCalledWith(PRICE_LIST_URL, expect.anything())
    const fresh = await getPriceList(AT)
    expect(priceFor(fresh, 'anthropic', 'claude-haiku-4-5')?.input).toBe(4e-6)
    expect(fresh?.fetchedAt).toBe(AT)
    expect(state.writes).toBe(1)
    expect(state.row?.fetchedAt.getTime()).toBe(AT)
  })

  it('keeps the last good copy when a stale refresh fails, and does not retry on every request', async () => {
    fetchMock.mockResolvedValue(respondWith({}, 503))
    state.row = storedPriceRow(AT - PRICE_TTL_MS - HOUR)

    await getPriceList(AT)
    await settledPriceRefresh()
    const list = await getPriceList(AT + 1000)

    expect(priceFor(list, 'anthropic', 'claude-haiku-4-5')?.input).toBe(1e-6)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(state.writes).toBe(0)

    await getPriceList(AT + RETRY_AFTER_FAILURE_MS)
    await settledPriceRefresh()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('does not replace a good copy with a list that has no usable prices', async () => {
    fetchMock.mockResolvedValue(respondWith({ sample_spec: {} }))
    state.row = storedPriceRow(AT - PRICE_TTL_MS - HOUR)

    await getPriceList(AT)
    await settledPriceRefresh()

    expect(priceFor(await getPriceList(AT), 'anthropic', 'claude-haiku-4-5')).not.toBeNull()
    expect(state.writes).toBe(0)
  })

  it('waits for the first fetch when there has never been a copy', async () => {
    fetchMock.mockResolvedValue(respondWith(PRICE_LIST_EXCERPT))
    const list = await getPriceList(AT)
    expect(priceFor(list, 'gemini', 'gemini-3.5-flash-lite')).not.toBeNull()
    expect(state.writes).toBe(1)
  })

  it('has no prices at all when it has never been fetched and the fetch fails', async () => {
    fetchMock.mockRejectedValue(new Error('offline'))
    expect(await getPriceList(AT)).toBeNull()
  })

  it('shares one fetch between requests that arrive together', async () => {
    fetchMock.mockResolvedValue(respondWith(PRICE_LIST_EXCERPT))
    await Promise.all([getPriceList(AT), getPriceList(AT), getPriceList(AT)])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
