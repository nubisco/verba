// One Durable Object per account holds every open tab of that account: each
// project's room, and each person's notifications. A write handled by any
// Worker instance publishes here, so it reaches every tab at once (AGENTS.md,
// "Getting it to an open tab now: live delivery", after acta/server/src/live-hub.ts).
//
// Sockets are accepted through the hibernation API, so the object costs
// nothing between events. Each socket is tagged with its project and its
// person. The frames are the ones the Node server sends (ws/manager.ts and
// routes/ws.ts), so the web app cannot tell which runtime it talks to.
//
// A socket is authorised once, when it connects (worker/ws.ts). So a socket
// older than 30 minutes is closed with 4001 the next time something would be
// sent to it, and the tab reconnects through the sign-in check again.

import type { CfWebSocket, DurableObjectStateLike } from './cloudflare.js'
import { newWebSocketPair, upgradeResponse } from './cloudflare.js'

export const LIVE_MAX_AGE_MS = 30 * 60_000

/** Who a socket is, set by the Worker after its checks (worker/ws.ts). */
export interface LiveMember {
  projectId: string
  userId: string
  email: string
}

interface Attachment extends LiveMember {
  since: number
}

const roomTag = (projectId: string) => `project:${projectId}`
const userTag = (userId: string) => `user:${userId}`

/** The header the Worker uses to tell the hub who is connecting. */
export const LIVE_MEMBER_HEADER = 'x-verba-live-member'

export class LiveHub {
  constructor(
    private readonly state: DurableObjectStateLike,
    _env: unknown,
    private readonly now: () => number = Date.now,
  ) {}

  async fetch(request: Request): Promise<Response> {
    const path = new URL(request.url).pathname
    if (path === '/connect') return this.connect(request)
    if (path === '/broadcast' && request.method === 'POST') {
      const { projectId, payload } = (await request.json()) as { projectId: string; payload: unknown }
      this.send(this.state.getWebSockets(roomTag(projectId)), payload)
      return new Response(null, { status: 204 })
    }
    if (path === '/notify' && request.method === 'POST') {
      const { userId, payload } = (await request.json()) as { userId: string; payload: unknown }
      this.send(this.state.getWebSockets(userTag(userId)), payload)
      return new Response(null, { status: 204 })
    }
    return new Response('Not found', { status: 404 })
  }

  private connect(request: Request): Response {
    const member = JSON.parse(request.headers.get(LIVE_MEMBER_HEADER) ?? 'null') as LiveMember | null
    if (!member) return new Response('Who is connecting?', { status: 400 })
    const [client, server] = newWebSocketPair()
    this.state.acceptWebSocket(server, [roomTag(member.projectId), userTag(member.userId)])
    server.serializeAttachment({ ...member, since: this.now() } satisfies Attachment)
    this.send(
      this.state.getWebSockets(roomTag(member.projectId)),
      { type: 'presence.joined', userId: member.userId, email: member.email },
      server,
    )
    return upgradeResponse(client)
  }

  webSocketMessage(ws: CfWebSocket, message: string | ArrayBuffer): void {
    const me = ws.deserializeAttachment() as Attachment | null
    if (!me || typeof message !== 'string') return
    let msg: { type?: string; keyId?: string }
    try {
      msg = JSON.parse(message)
    } catch {
      return
    }
    if (msg.type === 'presence.editing' && msg.keyId) {
      this.send(
        this.state.getWebSockets(roomTag(me.projectId)),
        { type: 'presence.editing', userId: me.userId, email: me.email, keyId: msg.keyId },
        ws,
      )
    }
  }

  webSocketClose(ws: CfWebSocket, code: number, reason: string): void {
    const me = ws.deserializeAttachment() as Attachment | null
    try {
      ws.close(code, reason)
    } catch {
      // Already closed.
    }
    if (me) {
      this.send(
        this.state.getWebSockets(roomTag(me.projectId)).filter((s) => s !== ws),
        { type: 'presence.left', userId: me.userId },
      )
    }
  }

  /** Send to every open socket in `sockets` but `except`, retiring the ones too old to keep. */
  private send(sockets: CfWebSocket[], payload: unknown, except?: CfWebSocket): void {
    const frame = JSON.stringify(payload)
    for (const ws of sockets) {
      if (ws === except || ws.readyState !== 1) continue
      const since = (ws.deserializeAttachment() as Attachment | null)?.since ?? 0
      if (this.now() - since > LIVE_MAX_AGE_MS) {
        ws.close(4001, 'Sign in again')
        continue
      }
      ws.send(frame)
    }
  }
}
