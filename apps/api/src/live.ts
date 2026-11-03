// Live delivery: how a change reaches every open tab of the people concerned.
//
// Services call `live()` and never know who holds the sockets. On Node that is
// this process (ws/manager.ts), so delivery is a direct send. On a Cloudflare
// Worker a write is handled by whichever instance Cloudflare picks, so the
// Worker entry swaps in one that publishes to the account's Durable Object
// (AGENTS.md, "Getting it to an open tab now: live delivery").

import { wsManager } from './ws/index.js'

export interface LiveDelivery {
  /** Every open tab on a project. */
  broadcast(projectId: string, payload: unknown): void
  /** Every open tab of one person. `projectId` is the project the event belongs to. */
  notifyUser(userId: string, projectId: string, payload: object): void
}

/** The sockets in this process. */
const inProcess: LiveDelivery = {
  broadcast: (projectId, payload) => wsManager.broadcast(projectId, payload),
  notifyUser: (userId, _projectId, payload) => wsManager.notifyUser(userId, payload),
}

let current: LiveDelivery = inProcess

/** Who delivers live updates. The in-process rooms unless an entry point set another. */
export function live(): LiveDelivery {
  return current
}

/** Replace live delivery. The Worker entry sets it once. */
export function setLive(next: LiveDelivery): void {
  current = next
}
