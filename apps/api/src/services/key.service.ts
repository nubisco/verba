import { prisma } from '../prisma.js'
import type { CreateKeyInput, UpdateKeyInput, KeyQueryInput } from '../schemas/key.schema.js'
import * as audit from './audit.service.js'
import { emit } from '../events.js'
import { serializeKeyRecord } from './key-identity.service.js'

function notFound(): never {
  throw Object.assign(new Error('Key not found'), { statusCode: 404 })
}

export async function listKeys(projectId: string, query: KeyQueryInput) {
  const { namespaceId, search, page, limit, includeTranslations } = query
  const normalizedSearch = search?.trim()
  const shouldSearchTranslationContent = Boolean(normalizedSearch && normalizedSearch.length >= 3)

  const searchFilter = normalizedSearch
    ? shouldSearchTranslationContent
      ? {
          OR: [
            { name: { contains: normalizedSearch } },
            {
              translations: {
                some: {
                  deletedAt: null,
                  text: { contains: normalizedSearch },
                },
              },
            },
          ],
        }
      : { name: { contains: normalizedSearch } }
    : {}

  const where = {
    projectId,
    deletedAt: null,
    ...(namespaceId ? { namespaceId } : {}),
    ...searchFilter,
  }
  const [items, total] = await Promise.all([
    prisma.key.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { name: 'asc' },
      include: {
        namespace: {
          select: {
            id: true,
            slug: true,
          },
        },
        ...(includeTranslations
          ? {
              translations: {
                where: { deletedAt: null },
                select: { localeId: true, text: true },
              },
            }
          : {}),
      },
    }),
    prisma.key.count({ where }),
  ])
  return { items: items.map(serializeKeyRecord), total, page, limit }
}

export async function getKey(projectId: string, id: string) {
  const key = await prisma.key.findFirst({
    where: { id, projectId, deletedAt: null },
    include: {
      namespace: {
        select: {
          id: true,
          slug: true,
        },
      },
    },
  })
  if (!key) notFound()
  return serializeKeyRecord(key)
}

export async function createKey(projectId: string, data: CreateKeyInput, userId?: string) {
  const existing = await prisma.key.findUnique({
    where: {
      namespaceId_name: { namespaceId: data.namespaceId, name: data.name },
    },
  })
  if (existing)
    throw Object.assign(new Error('Key name already exists in this namespace'), {
      statusCode: 409,
    })
  const key = await prisma.key.create({ data: { ...data, projectId } })

  // Auto-create TODO translations for every active locale in this project
  const locales = await prisma.locale.findMany({
    where: { projectId, isEnabled: true },
  })
  if (locales.length > 0) {
    await prisma.translation.createMany({
      data: locales.map((l) => ({
        keyId: key.id,
        localeId: l.id,
        text: '',
        status: 'TODO',
      })),
    })
  }

  await audit.log({
    projectId,
    userId,
    action: 'key.created',
    entityType: 'Key',
    entityId: key.id,
    after: key,
  })
  emit({ type: 'key.created', keyId: key.id, projectId, name: key.name })
  const created = await prisma.key.findUniqueOrThrow({
    where: { id: key.id },
    include: {
      namespace: {
        select: {
          id: true,
          slug: true,
        },
      },
    },
  })
  return serializeKeyRecord(created)
}

export async function updateKey(projectId: string, id: string, data: UpdateKeyInput) {
  await getKey(projectId, id)
  const updated = await prisma.key.update({
    where: { id },
    data,
    include: {
      namespace: {
        select: {
          id: true,
          slug: true,
        },
      },
    },
  })
  return serializeKeyRecord(updated)
}

export async function deleteKey(projectId: string, id: string, _userId?: string) {
  await getKey(projectId, id)
  await prisma.key.update({ where: { id }, data: { deletedAt: new Date() } })
  await prisma.translation.updateMany({
    where: { keyId: id },
    data: { deletedAt: new Date() },
  })
}

export async function restoreKey(projectId: string, id: string) {
  const key = await prisma.key.findFirst({ where: { id, projectId } })
  if (!key) notFound()
  // Check for name conflict with non-deleted key
  const conflict = await prisma.key.findFirst({
    where: {
      namespaceId: key.namespaceId,
      name: key.name,
      deletedAt: null,
      id: { not: id },
    },
  })
  if (conflict) {
    throw Object.assign(new Error('A key with this name already exists; cannot restore'), {
      statusCode: 409,
    })
  }
  await prisma.key.update({ where: { id }, data: { deletedAt: null } })
  await prisma.translation.updateMany({
    where: { keyId: id },
    data: { deletedAt: null },
  })
  const restored = await prisma.key.findFirst({
    where: { id },
    include: {
      namespace: {
        select: {
          id: true,
          slug: true,
        },
      },
    },
  })
  return restored ? serializeKeyRecord(restored) : restored
}
