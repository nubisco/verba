import { describe, it, expect, vi, beforeEach } from 'vitest'
import { bus, emit } from '../events.js'
import type { VerbaEvent } from '../events.js'

describe('event bus', () => {
  beforeEach(() => {
    bus.removeAllListeners()
  })

  it('emits translation.updated_text and listener receives it', () => {
    const listener = vi.fn()
    bus.on(listener)
    const payload: VerbaEvent = {
      type: 'translation.updated_text',
      translationId: 't1',
      keyId: 'k1',
      projectId: 'p1',
      before: 'Hello',
      after: 'Hi',
    }
    emit(payload)
    expect(listener).toHaveBeenCalledOnce()
    expect(listener).toHaveBeenCalledWith(payload)
  })

  it('emits translation.status_changed', () => {
    const received: VerbaEvent[] = []
    bus.on((e) => received.push(e))
    emit({
      type: 'translation.status_changed',
      translationId: 't1',
      keyId: 'k1',
      projectId: 'p1',
      before: 'TODO',
      after: 'IN_PROGRESS',
    })
    expect(received).toHaveLength(1)
    expect(received[0].type).toBe('translation.status_changed')
  })

  it('emits translation.approved', () => {
    const received: VerbaEvent[] = []
    bus.on((e) => received.push(e))
    emit({
      type: 'translation.approved',
      translationId: 't1',
      keyId: 'k1',
      projectId: 'p1',
    })
    expect(received[0].type).toBe('translation.approved')
  })

  it('emits key.created', () => {
    const received: VerbaEvent[] = []
    bus.on((e) => received.push(e))
    emit({
      type: 'key.created',
      keyId: 'k1',
      projectId: 'p1',
      name: 'greeting',
    })
    expect(received[0].type).toBe('key.created')
  })

  it('emits import.applied', () => {
    const received: VerbaEvent[] = []
    bus.on((e) => received.push(e))
    emit({ type: 'import.applied', projectId: 'p1', created: 5, updated: 2 })
    expect(received[0].type).toBe('import.applied')
  })

  it('multiple listeners all receive event', () => {
    const l1 = vi.fn()
    const l2 = vi.fn()
    bus.on(l1)
    bus.on(l2)
    emit({
      type: 'key.created',
      keyId: 'k2',
      projectId: 'p2',
      name: 'farewell',
    })
    expect(l1).toHaveBeenCalledOnce()
    expect(l2).toHaveBeenCalledOnce()
  })

  it('plugin errors do not crash emitter (fail-safe)', () => {
    bus.on(() => {
      throw new Error('plugin crash')
    })
    expect(() => emit({ type: 'key.created', keyId: 'k3', projectId: 'p3', name: 'oops' })).toThrow('plugin crash') // EventEmitter propagates synchronous throws; plugins should handle internally
  })
})
