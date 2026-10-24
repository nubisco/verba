import nodeCrypto from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Row = {
  id: string
  aiEnabled: boolean
  aiProvider: string | null
  aiApiKey: string | null
  aiModel: string | null
  aiUpdatedAt: Date | null
}

const db = vi.hoisted(() => ({ projects: new Map<string, Row>() }))

vi.mock('../prisma.js', () => ({
  prisma: {
    project: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => db.projects.get(where.id) ?? null),
      findMany: vi.fn(async () => [...db.projects.values()].filter((p) => p.aiApiKey !== null)),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<Row> }) => {
        const row = { ...db.projects.get(where.id)!, ...data }
        db.projects.set(where.id, row)
        return row
      }),
      updateMany: vi.fn(async ({ where, data }: { where: { id: string; aiApiKey: string }; data: Partial<Row> }) => {
        const row = db.projects.get(where.id)
        if (!row || row.aiApiKey !== where.aiApiKey) return { count: 0 }
        db.projects.set(where.id, { ...row, ...data })
        return { count: 1 }
      }),
    },
    aiUsage: { create: vi.fn(), groupBy: vi.fn() },
  },
}))
vi.mock('../services/audit.service.js', () => ({ log: vi.fn() }))
vi.mock('../services/ai-prices.service.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/ai-prices.service.js')>()),
  getPriceList: vi.fn(),
}))

import { prisma } from '../prisma.js'
import * as audit from '../services/audit.service.js'
import { getPriceList } from '../services/ai-prices.service.js'
import {
  getAiSettings,
  getUsageSummary,
  migrateStoredAiKeys,
  recordUsage,
  resolveAiConfig,
  saveAiSettings,
} from '../services/ai-settings.service.js'
import { isCurrentFormat } from '../services/encryption.service.js'

const KEY = 'sk-ant-api03-a-real-looking-key'

function legacySeal(plaintext: string, secret: string): string {
  const key = nodeCrypto.createHash('sha256').update(secret).digest()
  const iv = nodeCrypto.randomBytes(12)
  const cipher = nodeCrypto.createCipheriv('aes-256-gcm', key, iv)
  const data = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  return `${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${data.toString('base64')}`
}

function project(overrides: Partial<Row> = {}): Row {
  const row = {
    id: 'p1',
    aiEnabled: false,
    aiProvider: null,
    aiApiKey: null,
    aiModel: null,
    aiUpdatedAt: null,
    ...overrides,
  }
  db.projects.set(row.id, row)
  return row
}

beforeEach(() => {
  db.projects.clear()
  vi.clearAllMocks()
  vi.stubEnv('AI_ENCRYPTION_KEY', 'a-long-random-deployment-secret')
  vi.stubEnv('ENCRYPTION_KEY', '')
  vi.stubEnv('AI_DEV_SECRET', '')
  vi.stubEnv('JWT_SECRET', 'production-jwt-secret')
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('saving settings', () => {
  it('seals the key, reports hasKey and never returns the key', async () => {
    project()
    const settings = await saveAiSettings('p1', { enabled: true, provider: 'openai', apiKey: KEY }, 'u1')
    expect(settings).toMatchObject({ enabled: true, provider: 'openai', hasKey: true, model: null })
    expect(JSON.stringify(settings)).not.toContain(KEY)
    expect(isCurrentFormat(db.projects.get('p1')!.aiApiKey!)).toBe(true)
  })

  it('refuses to store a key when the deployment has no AI_ENCRYPTION_KEY', async () => {
    vi.stubEnv('AI_ENCRYPTION_KEY', '')
    project()
    await expect(saveAiSettings('p1', { apiKey: KEY }, 'u1')).rejects.toMatchObject({ statusCode: 503 })
    expect(db.projects.get('p1')!.aiApiKey).toBeNull()
    expect((await getAiSettings('p1')).canStoreKey).toBe(false)
  })

  it('keeps the stored key when only the model changes, and removes it on an explicit null', async () => {
    project()
    await saveAiSettings('p1', { apiKey: KEY }, 'u1')
    const sealed = db.projects.get('p1')!.aiApiKey
    await saveAiSettings('p1', { model: 'claude-sonnet-5' }, 'u1')
    expect(db.projects.get('p1')!.aiApiKey).toBe(sealed)
    expect((await saveAiSettings('p1', { apiKey: null }, 'u1')).hasKey).toBe(false)
  })

  it('logs the change to the audit log without the key', async () => {
    project()
    await saveAiSettings('p1', { apiKey: KEY }, 'u1')
    const entry = vi.mocked(audit.log).mock.calls[0][0]
    expect(entry.action).toBe('ai_settings.updated')
    expect(JSON.stringify(entry)).not.toContain(KEY)
  })
})

describe('the key a suggestion uses', () => {
  it('is the project’s own key, with the fleet default model', async () => {
    project()
    await saveAiSettings('p1', { enabled: true, provider: 'gemini', apiKey: KEY }, 'u1')
    expect(await resolveAiConfig('p1')).toEqual({ provider: 'gemini', model: 'gemini-3.5-flash-lite', apiKey: KEY })
  })

  it('is nothing at all without a stored key: there is no server key to fall back to', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ant-ours')
    vi.stubEnv('OPENAI_API_KEY', 'sk-ours')
    project({ aiEnabled: true, aiProvider: 'anthropic' })
    await expect(resolveAiConfig('p1')).rejects.toMatchObject({ statusCode: 422 })
  })

  it('reports a key this server can no longer open, and keeps it stored', async () => {
    project({ aiEnabled: true, aiProvider: 'anthropic', aiApiKey: legacySeal(KEY, 'a-secret-nobody-has') })
    expect((await getAiSettings('p1')).keyUnreadable).toBe(true)
    await expect(resolveAiConfig('p1')).rejects.toMatchObject({ statusCode: 422 })
    expect(db.projects.get('p1')!.aiApiKey).not.toBeNull()
  })
})

describe('migrating keys stored in an earlier format', () => {
  it('seals a key the old code stored under JWT_SECRET, and a plain-text one, in the current format', async () => {
    project({ id: 'p1', aiApiKey: legacySeal(KEY, 'production-jwt-secret') })
    project({ id: 'p2', aiApiKey: KEY })
    expect(await migrateStoredAiKeys()).toEqual({ resealed: 2, unreadable: 0, waiting: 0 })
    for (const id of ['p1', 'p2']) {
      expect(isCurrentFormat(db.projects.get(id)!.aiApiKey!)).toBe(true)
    }
    db.projects.set('p1', { ...db.projects.get('p1')!, aiEnabled: true })
    expect((await resolveAiConfig('p1')).apiKey).toBe(KEY)
  })

  it('without AI_ENCRYPTION_KEY, keeps an old key exactly as it is and does not use it under the old secret', async () => {
    vi.stubEnv('AI_ENCRYPTION_KEY', '')
    const stored = legacySeal(KEY, 'production-jwt-secret')
    project({ aiEnabled: true, aiProvider: 'openai', aiApiKey: stored })
    expect(await migrateStoredAiKeys()).toEqual({ resealed: 0, unreadable: 0, waiting: 1 })
    expect(db.projects.get('p1')!.aiApiKey).toBe(stored)
    await expect(resolveAiConfig('p1')).rejects.toMatchObject({ statusCode: 503 })
    expect((await getAiSettings('p1')).keyUnreadable).toBe(true)

    // Once the secret is set, the same key is sealed and used, without being entered again.
    vi.stubEnv('AI_ENCRYPTION_KEY', 'a-long-random-deployment-secret')
    expect((await resolveAiConfig('p1')).apiKey).toBe(KEY)
    expect(isCurrentFormat(db.projects.get('p1')!.aiApiKey!)).toBe(true)
  })

  it('never drops a key it cannot open', async () => {
    const stored = legacySeal(KEY, 'a-secret-nobody-has')
    project({ aiApiKey: stored })
    expect(await migrateStoredAiKeys()).toEqual({ resealed: 0, unreadable: 1, waiting: 0 })
    expect(db.projects.get('p1')!.aiApiKey).toBe(stored)
  })
})

describe('usage', () => {
  it('logs each request with the provider’s token counts, and never throws', async () => {
    vi.mocked(prisma.aiUsage.create).mockRejectedValueOnce(new Error('db down'))
    await expect(
      recordUsage('p1', { provider: 'anthropic', model: 'claude-haiku-4-5' }, 'suggest', {
        inputTokens: 40,
        outputTokens: 3,
      }),
    ).resolves.toBeUndefined()
  })

  it('totals the last 30 days and prices them from the fetched list', async () => {
    vi.mocked(prisma.aiUsage.groupBy).mockResolvedValue([
      {
        provider: 'anthropic',
        model: 'claude-haiku-4-5',
        _count: { _all: 3 },
        _sum: { inputTokens: 1000, outputTokens: 100 },
      },
    ] as never)
    vi.mocked(getPriceList).mockResolvedValue({
      fetchedAt: Date.UTC(2026, 9, 24),
      prices: { 'anthropic/claude-haiku-4-5': { input: 1e-6, output: 5e-6 } },
    })
    const usage = await getUsageSummary('p1')
    expect(usage).toMatchObject({ requests: 3, inputTokens: 1000, outputTokens: 100, days: 30 })
    expect(usage.estimatedUsd).toBeCloseTo(0.0015)
    expect(usage.pricingVerifiedOn).toBe('2026-10-24')
  })

  it('shows tokens and no cost for a model the list does not have, or with no list at all', async () => {
    vi.mocked(prisma.aiUsage.groupBy).mockResolvedValue([
      { provider: 'openai', model: 'gpt-unknown', _count: { _all: 1 }, _sum: { inputTokens: 5, outputTokens: 1 } },
    ] as never)
    vi.mocked(getPriceList).mockResolvedValue(null)
    const usage = await getUsageSummary('p1')
    expect(usage.estimatedUsd).toBeNull()
    expect(usage.unpricedModels).toEqual(['gpt-unknown'])
    expect(usage.pricingVerifiedOn).toBe('')
  })
})
