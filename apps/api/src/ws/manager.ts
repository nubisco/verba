import type { WebSocket } from '@fastify/websocket'

export class WsManager {
  private rooms = new Map<string, Set<WebSocket>>()
  private userConnections = new Map<string, Set<WebSocket>>()

  join(projectId: string, ws: WebSocket): void {
    if (!this.rooms.has(projectId)) {
      this.rooms.set(projectId, new Set())
    }
    this.rooms.get(projectId)!.add(ws)
  }

  leave(projectId: string, ws: WebSocket): void {
    this.rooms.get(projectId)?.delete(ws)
  }

  broadcast(projectId: string, payload: unknown, excludeWs?: WebSocket): void {
    const room = this.rooms.get(projectId)
    if (!room) return
    const data = JSON.stringify(payload)
    for (const ws of room) {
      if (ws !== excludeWs && ws.readyState === ws.OPEN) {
        ws.send(data)
      }
    }
  }

  addUserConnection(userId: string, ws: WebSocket): void {
    if (!this.userConnections.has(userId)) {
      this.userConnections.set(userId, new Set())
    }
    this.userConnections.get(userId)!.add(ws)
  }

  removeUserConnection(userId: string, ws: WebSocket): void {
    this.userConnections.get(userId)?.delete(ws)
  }

  notifyUser(userId: string, payload: object): void {
    const conns = this.userConnections.get(userId)
    if (!conns) return
    const msg = JSON.stringify(payload)
    for (const ws of conns) {
      if (ws.readyState === ws.OPEN) ws.send(msg)
    }
  }
}
