import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../prisma.js', () => ({
  prisma: {
    key: { findFirst: vi.fn(), findMany: vi.fn() },
    locale: { findFirst: vi.fn(), findUnique: vi.fn() },
    xliffSkeleton: { findUnique: vi.fn() },
  },
}))
vi.mock('../services/ai-settings.service.js', () => ({
  resolveAiConfig: vi.fn(async () => ({ provider: 'anthropic', model: 'claude-haiku-4-5', apiKey: 'k' })),
  recordUsage: vi.fn(),
}))
vi.mock('../services/translation.service.js', () => ({ upsertTranslation: vi.fn() }))

import { prisma } from '../prisma.js'
import { recordUsage } from '../services/ai-settings.service.js'
import { upsertTranslation } from '../services/translation.service.js'
import { fillLocale, suggestTranslation } from '../services/ai-translation.service.js'

const fetchMock = vi.fn()

function modelSays(text: string) {
  fetchMock.mockResolvedValueOnce(
    new Response(JSON.stringify({ content: [{ type: 'text', text }], usage: { input_tokens: 30, output_tokens: 4 } })),
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

describe('a suggestion for one key', () => {
  beforeEach(() => {
    vi.mocked(prisma.key.findFirst).mockResolvedValue({
      id: 'k1',
      name: 'greeting',
      description: null,
      namespace: { slug: 'common' },
      translations: [{ text: 'Hello %@', locale: { code: 'en', name: 'English' } }],
    } as never)
    vi.mocked(prisma.locale.findFirst).mockResolvedValue({ id: 'l2', code: 'pt', name: 'Portuguese' } as never)
  })

  it('is returned when it keeps the source placeholders, and its usage is logged', async () => {
    modelSays('Olá %@')
    expect(await suggestTranslation('p1', 'k1', 'pt')).toEqual({ suggestion: 'Olá %@', provider: 'anthropic' })
    expect(recordUsage).toHaveBeenCalledWith('p1', expect.anything(), 'suggest', { inputTokens: 30, outputTokens: 4 })
  })

  it('is withheld, with the reason, when the model dropped a placeholder', async () => {
    modelSays('Olá')
    const result = await suggestTranslation('p1', 'k1', 'pt')
    expect(result.suggestion).toBeNull()
    expect(result).toHaveProperty('rejected')
  })
})

describe('filling a locale', () => {
  it('writes only translations that pass the check', async () => {
    vi.mocked(prisma.locale.findUnique)
      .mockResolvedValueOnce({ id: 'pt', code: 'pt', name: 'Portuguese' } as never)
      .mockResolvedValueOnce({ id: 'en', code: 'en', name: 'English' } as never)
    vi.mocked(prisma.xliffSkeleton.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.key.findMany).mockResolvedValue([
      {
        id: 'a',
        name: 'a',
        description: null,
        namespace: { slug: 'c' },
        translations: [{ localeId: 'en', text: 'Hi {name}' }],
      },
      {
        id: 'b',
        name: 'b',
        description: null,
        namespace: { slug: 'c' },
        translations: [{ localeId: 'en', text: 'Bye {name}' }],
      },
    ] as never)
    modelSays('Olá {name}')
    modelSays('Adeus <a href="https://x.example">aqui</a>')

    const result = await fillLocale('p1', { localeCode: 'pt', onlyEmpty: true, limit: 10 }, 'u1', 'TRANSLATOR')

    expect(result).toMatchObject({ filled: 1, skipped: 1 })
    expect(upsertTranslation).toHaveBeenCalledTimes(1)
    expect(upsertTranslation).toHaveBeenCalledWith('a', 'pt', { text: 'Olá {name}' }, 'u1', 'TRANSLATOR')
  })
})
