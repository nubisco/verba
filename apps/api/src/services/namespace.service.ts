import { prisma } from '../prisma.js'
import type { CreateNamespaceInput, UpdateNamespaceInput } from '../schemas/namespace.schema.js'

function notFound(): never {
  throw Object.assign(new Error('Namespace not found'), { statusCode: 404 })
}

export async function listNamespaces(projectId: string) {
  return prisma.namespace.findMany({
    where: { projectId },
    orderBy: { name: 'asc' },
    include: { _count: { select: { keys: true } } },
  })
}

export async function getNamespace(projectId: string, id: string) {
  const ns = await prisma.namespace.findFirst({ where: { id, projectId } })
  if (!ns) notFound()
  return ns
}

export async function createNamespace(projectId: string, data: CreateNamespaceInput) {
  const existing = await prisma.namespace.findUnique({
    where: { projectId_slug: { projectId, slug: data.slug } },
  })
  if (existing)
    throw Object.assign(new Error('Slug already taken in this project'), {
      statusCode: 409,
    })
  return prisma.namespace.create({ data: { ...data, projectId } })
}

export async function updateNamespace(projectId: string, id: string, data: UpdateNamespaceInput) {
  await getNamespace(projectId, id)
  if (data.slug) {
    const existing = await prisma.namespace.findFirst({
      where: { projectId, slug: data.slug, NOT: { id } },
    })
    if (existing)
      throw Object.assign(new Error('Slug already taken in this project'), {
        statusCode: 409,
      })
  }
  return prisma.namespace.update({ where: { id }, data })
}

export async function deleteNamespace(projectId: string, id: string) {
  await getNamespace(projectId, id)
  await prisma.namespace.delete({ where: { id } })
}
