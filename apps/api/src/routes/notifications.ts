import type { Api } from '../http.js'
import { authenticate } from '../session.js'
import * as notifSvc from '../services/notification.service.js'

export function notificationRoutes(app: Api) {
  app.get('/notifications', authenticate, async (c) => {
    return c.json(await notifSvc.listNotifications(c.var.user.userId))
  })

  app.get('/notifications/count', authenticate, async (c) => {
    const count = await notifSvc.unreadCount(c.var.user.userId)
    return c.json({ count })
  })

  app.patch('/notifications/:id/read', authenticate, async (c) => {
    await notifSvc.markRead(c.req.param('id'), c.var.user.userId)
    return c.body(null, 204)
  })

  app.patch('/notifications/read-all', authenticate, async (c) => {
    await notifSvc.markAllRead(c.var.user.userId)
    return c.body(null, 204)
  })
}
