import { prisma } from '../prisma.js'
import { wsManager } from '../ws/index.js'
import * as audit from './audit.service.js'
import * as notifSvc from './notification.service.js'

export async function addComment(
  translationId: string,
  userId: string,
  text: string,
  projectId: string,
  parentId?: string,
) {
  // Resolve keyId via translation
  const translation = await prisma.translation.findUnique({
    where: { id: translationId },
    select: { keyId: true },
  })
  if (!translation) throw Object.assign(new Error('Translation not found'), { statusCode: 404 })

  const keyId = translation.keyId

  // Parse @mentions: match @word tokens
  const mentionTokens = [...text.matchAll(/@([\w.-]+)/g)].map((m) => m[1])

  // Look up mentioned users in project by name or email prefix
  let mentionedUsers: { id: string; name: string | null; email: string }[] = []
  if (mentionTokens.length > 0) {
    const projectMembers = await prisma.membership.findMany({
      where: { projectId },
      include: { user: { select: { id: true, name: true, email: true } } },
    })
    mentionedUsers = projectMembers
      .map((m) => m.user)
      .filter((u) => {
        const emailPrefix = u.email.split('@')[0].toLowerCase()
        const nameNorm = (u.name ?? '').toLowerCase().replace(/\s+/g, '')
        return mentionTokens.some((t) => t.toLowerCase() === emailPrefix || t.toLowerCase() === nameNorm)
      })
  }

  const mentionedUserIds = mentionedUsers.map((u) => u.id)

  const comment = await prisma.comment.create({
    data: {
      translationId,
      userId,
      text,
      parentId,
      mentionedUserIds: mentionedUserIds.join(','),
    },
    include: { user: { select: { id: true, email: true, name: true } } },
  })

  await audit.log({
    projectId,
    userId,
    action: 'comment.added',
    entityType: 'translation',
    entityId: translationId,
  })
  wsManager.broadcast(projectId, {
    type: 'comment.added',
    translationId,
    comment,
  })

  // Fire MENTION notifications
  const notifiedUserIds = new Set<string>()
  for (const mentionedUser of mentionedUsers) {
    if (mentionedUser.id === userId) continue
    await notifSvc.createNotification({
      userId: mentionedUser.id,
      actorId: userId,
      type: 'MENTION',
      projectId,
      keyId,
      commentId: comment.id,
    })
    notifiedUserIds.add(mentionedUser.id)
  }

  // Fire KEY_COMMENT notifications for assignees
  const assignees = await prisma.translation.findMany({
    where: { keyId, assignedToId: { not: null } },
    select: { assignedToId: true },
  })
  const uniqueAssigneeIds = Array.from(
    new Set(assignees.map((a: { assignedToId: string | null }) => String(a.assignedToId))),
  )
  for (const assigneeId of uniqueAssigneeIds) {
    if (assigneeId === userId || notifiedUserIds.has(assigneeId)) continue
    await notifSvc.createNotification({
      userId: assigneeId,
      actorId: userId,
      type: 'KEY_COMMENT',
      projectId,
      keyId,
      commentId: comment.id,
    })
  }

  return comment
}

export async function listComments(translationId: string) {
  return prisma.comment.findMany({
    where: { translationId, deletedAt: null },
    orderBy: { createdAt: 'asc' },
    include: { user: { select: { id: true, email: true, name: true } } },
  })
}

export async function deleteComment(id: string, userId: string, actorRole: string) {
  const comment = await prisma.comment.findUnique({ where: { id } })
  if (!comment) {
    throw Object.assign(new Error('Comment not found'), { statusCode: 404 })
  }
  const isMaintainerPlus = ['MAINTAINER', 'ADMIN'].includes(actorRole)
  if (comment.userId !== userId && !isMaintainerPlus) {
    throw Object.assign(new Error('Forbidden'), { statusCode: 403 })
  }
  await prisma.comment.update({
    where: { id },
    data: { deletedAt: new Date() },
  })
}
