import { describe, expect, it } from 'vitest'
import { historyActor, historyRows, type HistoryEntry } from '../history'

const entry = (over: Partial<HistoryEntry> = {}): HistoryEntry => ({
  id: 'a1',
  action: 'key.created',
  entityType: 'Key',
  entityId: 'k1',
  createdAt: '2026-10-25T10:00:00.000Z',
  user: { id: 'u1', email: 'ana@example.com', name: 'Ana' },
  ...over,
})

describe('historyActor', () => {
  it('names the person, falls back to their email, and says System for none', () => {
    expect(historyActor({ id: 'u', email: 'e@example.com', name: '  Ana  ' })).toBe('Ana')
    expect(historyActor({ id: 'u', email: 'e@example.com', name: '   ' })).toBe('e@example.com')
    expect(historyActor({ id: 'u', email: 'e@example.com', name: null })).toBe('e@example.com')
    expect(historyActor(null)).toBe('System')
  })
})

describe('historyRows', () => {
  it('keeps the API order and gives the table its four columns', () => {
    const rows = historyRows([entry(), entry({ id: 'a2', action: 'locale.created', user: null })], (ts) => `at ${ts}`)
    expect(rows).toEqual([
      { id: 'a1', action: 'key.created', entityType: 'Key', user: 'Ana', date: 'at 2026-10-25T10:00:00.000Z' },
      { id: 'a2', action: 'locale.created', entityType: 'Key', user: 'System', date: 'at 2026-10-25T10:00:00.000Z' },
    ])
  })
})
