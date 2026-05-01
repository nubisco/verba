import type { FastifyInstance } from 'fastify'
import type { WebSocket } from '@fastify/websocket'
import { wsManager } from '../ws/index.js'

export async function wsRoutes(app: FastifyInstance) {
  app.get<{ Params: { projectId: string } }>(
    '/ws/projects/:projectId',
    { websocket: true },
    async (socket: WebSocket, req) => {
      const projectId = (req.params as { projectId: string }).projectId

      // Authenticate via JWT cookie
      const rawCookie = req.headers.cookie ?? ''
      const token = rawCookie
        .split(';')
        .find((c) => c.trim().startsWith('token='))
        ?.split('=')[1]

      if (!token) {
        socket.close(1008, 'Unauthorized')
        return
      }

      let userId: string
      let email: string
      try {
        const payload = app.jwt.verify(token) as {
          userId: string
          email: string
        }
        userId = payload.userId
        email = payload.email
      } catch {
        socket.close(1008, 'Unauthorized')
        return
      }

      wsManager.join(projectId, socket)
      wsManager.addUserConnection(userId, socket)
      wsManager.broadcast(projectId, { type: 'presence.joined', userId, email }, socket)

      socket.on('message', (raw: Buffer) => {
        let msg: { type: string; keyId?: string; text?: string }
        try {
          msg = JSON.parse(raw.toString())
        } catch {
          return
        }

        if (msg.type === 'presence.editing' && msg.keyId) {
          wsManager.broadcast(projectId, { type: 'presence.editing', userId, email, keyId: msg.keyId }, socket)
        }
      })

      socket.on('close', () => {
        wsManager.leave(projectId, socket)
        wsManager.removeUserConnection(userId, socket)
        wsManager.broadcast(projectId, { type: 'presence.left', userId })
      })
    },
  )
}
