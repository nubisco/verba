// The project rooms on a Worker. The Worker checks who is connecting, the same
// checks as on Node (routes/ws.ts), then hands the socket to the account's
// Durable Object, which holds it (live-hub.ts).

import type { Api } from '../http.js'
import { authorizeRoom } from '../routes/ws.js'
import { accountOfProject } from '../services/plan-limits.service.js'
import type { WorkerEnv } from './cloudflare.js'
import { newWebSocketPair, upgradeResponse } from './cloudflare.js'
import { LIVE_MEMBER_HEADER, type LiveMember } from './live-hub.js'
import { hubFor } from './live.js'

/** Accept the socket and close it at once with 1008, as the Node server does. */
function refused(reason: string): Response {
  const [client, server] = newWebSocketPair()
  server.accept()
  server.close(1008, reason)
  return upgradeResponse(client)
}

export function workerWsRoutes(app: Api): void {
  app.get('/ws/projects/:projectId', async (c) => {
    if (c.req.header('upgrade')?.toLowerCase() !== 'websocket') {
      // 426, never 404: a tab must not mistake an outage for "no socket here".
      return c.json({ error: 'Expected a WebSocket upgrade' }, 426)
    }
    // A WebSocket is not covered by CORS, and the session cookie travels
    // between subdomains, so only the app's own pages may open one.
    const origin = c.req.header('origin')
    if (origin && new URL(origin).host !== new URL(c.req.url).host) return c.json({ error: 'Forbidden' }, 403)

    const access = await authorizeRoom(c)
    if ('refuse' in access) return refused(access.refuse)
    const accountId = await accountOfProject(access.projectId)
    if (!accountId) return refused('Forbidden')

    const env = c.env as unknown as WorkerEnv
    const member: LiveMember = { projectId: access.projectId, userId: access.userId, email: access.email }
    const headers = new Headers(c.req.raw.headers)
    headers.set(LIVE_MEMBER_HEADER, JSON.stringify(member))
    return hubFor(env.LIVE, accountId).fetch(new Request('https://live-hub/connect', { headers }))
  })
}
