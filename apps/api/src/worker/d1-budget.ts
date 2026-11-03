// Counts the D1 queries of each Worker invocation (a request, a Queue message,
// a cron run). D1 allows about 1,000 per invocation, and an invocation that
// passes it fails. Imports and AI fills run in chunks to stay far below it
// (import-job.service.ts), and this is how that is measured: every invocation
// that queried D1 logs its count, and one past D1_QUERY_WARN logs a warning.

import { AsyncLocalStorage } from 'node:async_hooks'
import type { D1DatabaseLike } from './cloudflare.js'

/** Where a warning starts, well before D1's own limit. */
export const D1_QUERY_WARN = 800

const invocations = new AsyncLocalStorage<{ queries: number }>()

/** The D1 binding, counting every statement prepared against it. */
export function countingD1<T extends D1DatabaseLike>(db: T): T {
  return new Proxy(db, {
    get(target, property) {
      const value = Reflect.get(target, property, target) as unknown
      if (typeof value !== 'function') return value
      if (property === 'prepare' || property === 'exec') {
        return (...args: unknown[]) => {
          const current = invocations.getStore()
          if (current) current.queries++
          return (value as (...a: unknown[]) => unknown).apply(target, args)
        }
      }
      return (value as (...a: unknown[]) => unknown).bind(target)
    },
  })
}

/** Run one invocation's work, then log how many D1 queries it made. */
export async function withQueryBudget<T>(label: string, work: () => Promise<T>): Promise<T> {
  const store = { queries: 0 }
  try {
    return await invocations.run(store, work)
  } finally {
    if (store.queries > 0) {
      const line = JSON.stringify({ msg: 'd1 queries', invocation: label, queries: store.queries })
      if (store.queries > D1_QUERY_WARN) console.warn(line)
      else console.log(line)
    }
  }
}

/** D1 reports the database size on every result, so the cheapest statement answers it. */
export async function d1SizeBytes(db: D1DatabaseLike): Promise<number | null> {
  const prepared = db.prepare('SELECT 1') as { run(): Promise<{ meta?: { size_after?: number } }> }
  const result = await prepared.run()
  const size = result?.meta?.size_after
  return typeof size === 'number' ? size : null
}
