import { EventEmitter } from 'node:events'

export type VerbaEvent =
  | {
      type: 'translation.updated_text'
      translationId: string
      keyId: string
      projectId: string
      before: string | null
      after: string | undefined
    }
  | {
      type: 'translation.status_changed'
      translationId: string
      keyId: string
      projectId: string
      before: string
      after: string
    }
  | {
      type: 'translation.approved'
      translationId: string
      keyId: string
      projectId: string
    }
  | { type: 'key.created'; keyId: string; projectId: string; name: string }
  | {
      type: 'import.applied'
      projectId: string
      created: number
      updated: number
    }

const _emitter = new EventEmitter()

export const bus = {
  emit(payload: VerbaEvent): void {
    _emitter.emit('verba', payload)
  },
  on(listener: (payload: VerbaEvent) => void): void {
    _emitter.on('verba', listener as (...args: unknown[]) => void)
  },
  off(listener: (payload: VerbaEvent) => void): void {
    _emitter.off('verba', listener as (...args: unknown[]) => void)
  },
  removeAllListeners(): void {
    _emitter.removeAllListeners('verba')
  },
}

export function emit(payload: VerbaEvent): void {
  bus.emit(payload)
}
