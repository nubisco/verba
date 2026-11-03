import { getCookie } from 'hono/cookie'
import type { UpgradeWebSocket, WSContext } from 'hono/ws'
import type { Api } from '../http.js'
import { param } from '../http.js'
import { wsManager } from '../ws/index.js'
import { requireProjectRole } from '../services/acl.service.js'
import { SESSION_COOKIE, verifySession } from '../session.js'
import { Role } from '../types.js'

/** Events for a socket that is accepted and then closed at once with a reason. */
function refuse(reason: string) {
  return {
    onOpen: (_event: Event, ws: WSContext) => ws.close(1008, reason),
  }
}

export function wsRoutes(app: Api, upgradeWebSocket: UpgradeWebSocket) {
  app.get(
    '/ws/projects/:projectId',
    upgradeWebSocket(async (c) => {
      const projectId = param(c, 'projectId')

      // Authenticate with the session cookie, checked like any other request.
      const token = getCookie(c, SESSION_COOKIE)
      const session = token ? await verifySession(token) : null
      if (!session) return refuse('Unauthorized')
      const { userId, email } = session

      // A room carries every live edit, comment and presence event of its
      // project, so joining one is reading the project: the same READER check
      // as the REST routes. Without it any signed-in user could listen to any
      // project by its id.
      try {
        await requireProjectRole(userId, projectId, Role.READER)
      } catch {
        return refuse('Forbidden')
      }

      return {
        onOpen: (_event, ws) => {
          wsManager.join(projectId, ws)
          wsManager.addUserConnection(userId, ws)
          wsManager.broadcast(projectId, { type: 'presence.joined', userId, email }, ws)
        },
        onMessage: (event, ws) => {
          let msg: { type: string; keyId?: string; text?: string }
          try {
            msg = JSON.parse(String(event.data))
          } catch {
            return
          }

          if (msg.type === 'presence.editing' && msg.keyId) {
            wsManager.broadcast(projectId, { type: 'presence.editing', userId, email, keyId: msg.keyId }, ws)
          }
        },
        onClose: (_event, ws) => {
          wsManager.leave(projectId, ws)
          wsManager.removeUserConnection(userId, ws)
          wsManager.broadcast(projectId, { type: 'presence.left', userId })
        },
      }
    }),
  )
}
