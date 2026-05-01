import { prisma } from '../prisma.js'
import { canTransitionStatus } from './acl.service.js'
import * as audit from './audit.service.js'
import { emit } from '../events.js'
import { Status, Role } from '../types.js'
import { wsManager } from '../ws/index.js'
import type { UpsertTranslationInput, TranslationQueryInput } from '../schemas/translation.schema.js'
import { serializeKeyRecord } from './key-identity.service.js'

function notFound(): never {
  throw Object.assign(new Error('Translation not found'), { statusCode: 404 })
}

export async function upsertTranslation(
  keyId: string,
  localeId: string,
  data: UpsertTranslationInput,
  userId?: string,
  actorRole?: string,
) {
  const existing = await prisma.translation.findUnique({
    where: { keyId_localeId: { keyId, localeId } },
  })
  if (existing) {
    if (
      existing.assignedToId !== null &&
      userId !== existing.assignedToId &&
      actorRole !== 'MAINTAINER' &&
      actorRole !== 'ADMIN'
    ) {
      throw Object.assign(new Error('This translation is assigned to another user'), {
        statusCode: 403,
      })
    }
    const textChanged = data.text !== undefined && data.text !== existing.text
    const autoStatus =
      data.text !== undefined && existing.status === 'TODO' && !data.status
        ? 'IN_PROGRESS'
        : (data.status ?? existing.status)
    const result = await prisma.translation.update({
      where: { id: existing.id },
      data: {
        text: data.text,
        status: autoStatus,
        updatedById: data.updatedById,
        version: textChanged ? existing.version + 1 : existing.version,
      },
    })
    if (textChanged) {
      const key = await prisma.key.findUnique({ where: { id: keyId } })
      if (key) {
        await audit.log({
          projectId: key.projectId,
          userId,
          action: 'translation.updated_text',
          entityType: 'Translation',
          entityId: existing.id,
          before: { text: existing.text },
          after: { text: data.text },
        })
        emit({
          type: 'translation.updated_text',
          translationId: existing.id,
          keyId,
          projectId: key.projectId,
          before: existing.text,
          after: data.text,
        })
        wsManager.broadcast(key.projectId, {
          type: 'translation.updated',
          translationId: result.id,
          keyId,
          text: data.text,
          status: result.status,
        })
      }
    }
    return result
  }
  const created = await prisma.translation.create({
    data: { keyId, localeId, ...data },
  })
  const createdKey = await prisma.key.findUnique({ where: { id: keyId } })
  if (createdKey) {
    wsManager.broadcast(createdKey.projectId, {
      type: 'translation.updated',
      translationId: created.id,
      keyId,
      text: data.text,
      status: created.status,
    })
  }
  return created
}

export async function listTranslations(projectId: string, query: TranslationQueryInput) {
  const { status, namespaceId, localeId, keyId, page, limit } = query
  const translations = await prisma.translation.findMany({
    where: {
      deletedAt: null,
      key: {
        projectId,
        ...(namespaceId ? { namespaceId } : {}),
      },
      ...(status ? { status } : {}),
      ...(localeId ? { localeId } : {}),
      ...(keyId ? { keyId } : {}),
    },
    include: {
      key: {
        include: {
          namespace: { select: { id: true, slug: true } },
        },
      },
      locale: true,
    },
    skip: (page - 1) * limit,
    take: limit,
    orderBy: { updatedAt: 'desc' },
  })
  return translations.map((translation) => ({
    ...translation,
    key: serializeKeyRecord(translation.key),
  }))
}

export async function getTranslation(id: string) {
  const t = await prisma.translation.findUnique({
    where: { id },
    include: {
      key: {
        include: {
          namespace: { select: { id: true, slug: true } },
        },
      },
      locale: true,
    },
  })
  if (!t) notFound()
  return {
    ...t,
    key: serializeKeyRecord(t.key),
  }
}

export async function listTranslationsForKanban(projectId: string) {
  const translations = await prisma.translation.findMany({
    where: { key: { projectId }, deletedAt: null },
    include: {
      key: {
        select: {
          id: true,
          name: true,
          namespaceId: true,
          namespace: { select: { id: true, slug: true } },
        },
      },
      locale: { select: { code: true } },
      updatedBy: { select: { id: true, email: true } },
      assignedTo: { select: { id: true, email: true, name: true } },
    },
  })
  const grouped: Record<string, typeof translations> = {
    TODO: [],
    IN_PROGRESS: [],
    SUBMITTED: [],
    APPROVED: [],
  }
  for (const t of translations) {
    if (grouped[t.status]) {
      grouped[t.status].push({
        ...t,
        key: serializeKeyRecord(t.key),
      })
    }
  }
  return grouped
}

export async function updateStatus(id: string, newStatus: string, actorRole: string, userId?: string) {
  const t = await prisma.translation.findUnique({ where: { id } })
  if (!t) notFound()
  if (t.assignedToId !== null && t.assignedToId !== userId && actorRole !== 'MAINTAINER' && actorRole !== 'ADMIN') {
    throw Object.assign(new Error('This translation is assigned to another user'), {
      statusCode: 403,
    })
  }
  if (!canTransitionStatus(actorRole, t.status, newStatus)) {
    throw Object.assign(new Error(`Invalid transition: ${t.status} → ${newStatus}`), {
      statusCode: 422,
    })
  }
  const result = await prisma.translation.update({
    where: { id },
    data: { status: newStatus },
  })
  const key = await prisma.key.findUnique({ where: { id: t.keyId } })
  if (key) {
    await audit.log({
      projectId: key.projectId,
      userId,
      action: newStatus === Status.APPROVED ? 'translation.approved' : 'translation.status_changed',
      entityType: 'Translation',
      entityId: id,
      before: { status: t.status },
      after: { status: newStatus },
    })
    if (newStatus === Status.APPROVED) {
      emit({
        type: 'translation.approved',
        translationId: id,
        keyId: t.keyId,
        projectId: key.projectId,
      })
    } else {
      emit({
        type: 'translation.status_changed',
        translationId: id,
        keyId: t.keyId,
        projectId: key.projectId,
        before: t.status,
        after: newStatus,
      })
    }
    wsManager.broadcast(key.projectId, {
      type: 'translation.moved',
      translationId: id,
      status: newStatus,
      assignedToId: result.assignedToId ?? null,
    })
  }
  return result
}

export async function assignTranslation(
  projectId: string,
  translationId: string,
  assigneeId: string | null,
  actorRole: string,
  actorId?: string,
) {
  const t = await prisma.translation.findUnique({
    where: { id: translationId },
    include: { key: true },
  })
  if (!t || t.key.projectId !== projectId) {
    throw Object.assign(new Error('Translation not found'), { statusCode: 404 })
  }

  const isMaintainerPlus = [Role.MAINTAINER, Role.ADMIN].includes(actorRole as typeof Role.ADMIN)
  const isTranslatorPlus = [Role.TRANSLATOR, Role.MAINTAINER, Role.ADMIN].includes(actorRole as typeof Role.ADMIN)

  // Translators can only self-assign (or unassign themselves)
  if (!isMaintainerPlus) {
    if (!isTranslatorPlus) {
      throw Object.assign(new Error('Forbidden'), { statusCode: 403 })
    }
    if (assigneeId !== null && assigneeId !== actorId) {
      throw Object.assign(new Error('Forbidden: can only self-assign'), {
        statusCode: 403,
      })
    }
  }

  const updated = await prisma.translation.update({
    where: { id: translationId },
    data: { assignedToId: assigneeId },
    include: { assignedTo: { select: { id: true, email: true, name: true } } },
  })

  wsManager.broadcast(projectId, {
    type: 'translation.assigned',
    translationId,
    projectId,
    assignedToId: assigneeId,
  })

  await audit.log({
    projectId,
    userId: actorId,
    action: assigneeId ? 'translation.assigned' : 'translation.unassigned',
    entityType: 'Translation',
    entityId: translationId,
    after: { assignedToId: assigneeId },
  })

  return updated
}
