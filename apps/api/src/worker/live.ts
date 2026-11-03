// Live delivery on a Worker: every event goes to the Durable Object of the
// project's account (live-hub.ts), after the response (defer.ts).

import { defer } from '../defer.js'
import type { LiveDelivery } from '../live.js'
import { accountOfProject } from '../services/plan-limits.service.js'
import type { DurableObjectNamespaceLike, DurableObjectStub } from './cloudflare.js'

/** A project never changes account, so its account is looked up once per isolate. */
const accounts = new Map<string, string>()

async function accountFor(projectId: string): Promise<string | null> {
  const known = accounts.get(projectId)
  if (known) return known
  const accountId = await accountOfProject(projectId)
  if (accountId) accounts.set(projectId, accountId)
  return accountId
}

export function hubFor(namespace: DurableObjectNamespaceLike, accountId: string): DurableObjectStub {
  return namespace.get(namespace.idFromName(accountId))
}

export function hubLive(namespace: DurableObjectNamespaceLike): LiveDelivery {
  async function post(projectId: string, path: string, body: unknown): Promise<void> {
    const accountId = await accountFor(projectId)
    if (!accountId) return
    const res = await hubFor(namespace, accountId).fetch(
      new Request(`https://live-hub${path}`, { method: 'POST', body: JSON.stringify(body) }),
    )
    if (!res.ok) throw new Error(`live hub answered ${res.status}`)
  }
  return {
    broadcast: (projectId, payload) => defer(post(projectId, '/broadcast', { projectId, payload }), 'live broadcast'),
    notifyUser: (userId, projectId, payload) =>
      defer(post(projectId, '/notify', { userId, payload }), 'live notification'),
  }
}
