import type { FastifyInstance } from 'fastify'
import * as notifSvc from '../services/notification.service.js'

export async function notificationRoutes(app: FastifyInstance) {
  app.get('/notifications', { preHandler: [app.authenticate] }, async (req) => {
    return notifSvc.listNotifications(req.user.userId)
  })

  app.get('/notifications/count', { preHandler: [app.authenticate] }, async (req) => {
    const count = await notifSvc.unreadCount(req.user.userId)
    return { count }
  })

  app.patch<{ Params: { id: string } }>(
    '/notifications/:id/read',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      await notifSvc.markRead(req.params.id, req.user.userId)
      return reply.status(204).send()
    },
  )

  app.patch('/notifications/read-all', { preHandler: [app.authenticate] }, async (req, reply) => {
    await notifSvc.markAllRead(req.user.userId)
    return reply.status(204).send()
  })
}
