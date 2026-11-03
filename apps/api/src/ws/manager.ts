/**
 * One open socket, as the rooms need it. Hono's WSContext on Node (and on
 * Workers) has this shape, so the manager does not care which runtime it is.
 */
export interface LiveSocket {
  readonly readyState: number
  send(data: string): void
}

/** WebSocket.OPEN, the same number in every runtime. */
const OPEN = 1

export class WsManager {
  private rooms = new Map<string, Set<LiveSocket>>()
  private userConnections = new Map<string, Set<LiveSocket>>()

  join(projectId: string, ws: LiveSocket): void {
    if (!this.rooms.has(projectId)) {
      this.rooms.set(projectId, new Set())
    }
    this.rooms.get(projectId)!.add(ws)
  }

  leave(projectId: string, ws: LiveSocket): void {
    this.rooms.get(projectId)?.delete(ws)
  }

  broadcast(projectId: string, payload: unknown, excludeWs?: LiveSocket): void {
    const room = this.rooms.get(projectId)
    if (!room) return
    const data = JSON.stringify(payload)
    for (const ws of room) {
      if (ws !== excludeWs && ws.readyState === OPEN) {
        ws.send(data)
      }
    }
  }

  addUserConnection(userId: string, ws: LiveSocket): void {
    if (!this.userConnections.has(userId)) {
      this.userConnections.set(userId, new Set())
    }
    this.userConnections.get(userId)!.add(ws)
  }

  removeUserConnection(userId: string, ws: LiveSocket): void {
    this.userConnections.get(userId)?.delete(ws)
  }

  notifyUser(userId: string, payload: object): void {
    const conns = this.userConnections.get(userId)
    if (!conns) return
    const msg = JSON.stringify(payload)
    for (const ws of conns) {
      if (ws.readyState === OPEN) ws.send(msg)
    }
  }
}
