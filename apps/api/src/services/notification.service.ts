import { prisma } from '../prisma.js'
import { wsManager } from '../ws/index.js'

export async function createNotification(data: {
  userId: string
  actorId?: string
  type: 'MENTION' | 'KEY_COMMENT'
  projectId: string
  keyId: string
  commentId?: string
}) {
  const notif = await prisma.notification.create({ data })
  wsManager.notifyUser(data.userId, {
    type: 'notification.new',
    notification: notif,
  })
  return notif
}

export async function listNotifications(userId: string, unreadOnly = false) {
  return prisma.notification.findMany({
    where: { userId, ...(unreadOnly ? { isRead: false } : {}) },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: {
      actor: { select: { id: true, name: true, email: true } },
      key: {
        select: { id: true, name: true, namespace: { select: { slug: true } } },
      },
      comment: { select: { id: true, text: true } },
    },
  })
}

export async function markRead(notifId: string, userId: string) {
  return prisma.notification.updateMany({
    where: { id: notifId, userId },
    data: { isRead: true },
  })
}

export async function markAllRead(userId: string) {
  return prisma.notification.updateMany({
    where: { userId, isRead: false },
    data: { isRead: true },
  })
}

export async function unreadCount(userId: string) {
  return prisma.notification.count({ where: { userId, isRead: false } })
}
