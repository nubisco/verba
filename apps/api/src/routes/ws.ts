import { getCookie } from 'hono/cookie'
import type { UpgradeWebSocket, WSContext } from 'hono/ws'
import type { Api, Ctx } from '../http.js'
import { param } from '../http.js'
import { wsManager } from '../ws/index.js'
import { requireProjectRole } from '../services/acl.service.js'
import { SESSION_COOKIE, verifySession } from '../session.js'
import { Role } from '../types.js'

/** Who may join a project's room, or why not. Shared by the Node and Worker sockets. */
export type RoomAccess = { userId: string; email: string; projectId: string } | { refuse: 'Unauthorized' | 'Forbidden' }

/**
 * The checks every socket passes before it joins a room: a valid session
 * cookie, and READER on the project. A room carries every live edit, comment
 * and presence event of its project, so joining one is reading the project.
 * Without the role check any signed-in user could listen to any project by
 * its id.
 */
export async function authorizeRoom(c: Ctx): Promise<RoomAccess> {
  const projectId = param(c, 'projectId')
  const token = getCookie(c, SESSION_COOKIE)
  const session = token ? await verifySession(token) : null
  if (!session) return { refuse: 'Unauthorized' }
  try {
    await requireProjectRole(session.userId, projectId, Role.READER)
  } catch {
    return { refuse: 'Forbidden' }
  }
  return { userId: session.userId, email: session.email, projectId }
}

/** Events for a socket that is accepted and then closed at once with a reason. */
function refuse(reason: string) {
  return {
    onOpen: (_event: Event, ws: WSContext) => ws.close(1008, reason),
  }
}

/** The project rooms on Node: the sockets live in this process (ws/manager.ts). */
export function wsRoutes(app: Api, upgradeWebSocket: UpgradeWebSocket) {
  app.get(
    '/ws/projects/:projectId',
    upgradeWebSocket(async (c) => {
      const access = await authorizeRoom(c)
      if ('refuse' in access) return refuse(access.refuse)
      const { userId, email, projectId } = access

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
