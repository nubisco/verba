import { defineStore } from 'pinia'
import { reactive } from 'vue'
import { apiFetch } from '../api'

/**
 * Lazy key-name cache.
 * Any component that needs a key's display name calls resolve(): the first
 * call fetches from the API, subsequent calls are no-ops (cache hit).
 * The cache is reactive so computed breadcrumbs update the moment the name lands.
 */
export const useKeyNameStore = defineStore('keyName', () => {
  // Vue 3's reactive() tracks Map.set() natively
  const cache = reactive(new Map<string, string>())
  const pending = new Set<string>()

  async function resolve(projectId: string, keyId: string): Promise<void> {
    if (cache.has(keyId) || pending.has(keyId)) return
    pending.add(keyId)
    try {
      const key = await apiFetch<{ name: string }>(`/projects/${projectId}/keys/${keyId}`)
      cache.set(keyId, key.name)
    } catch {
      // Fallback: leave name unresolved; breadcrumb will show raw ID
    } finally {
      pending.delete(keyId)
    }
  }

  /** Returns the resolved name, or the raw keyId while the fetch is in-flight. */
  function getName(keyId: string): string {
    return cache.get(keyId) ?? keyId
  }

  /** Warm the cache from data already loaded by a view (e.g. board kanban data). */
  function seed(keyId: string, name: string): void {
    if (!cache.has(keyId)) cache.set(keyId, name)
  }

  return { resolve, getName, seed }
})
