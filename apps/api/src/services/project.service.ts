import { prisma } from '../prisma.js'
import type { CreateProjectInput, UpdateProjectInput } from '../schemas/project.schema.js'
import { encrypt, isEncrypted } from './encryption.service.js'

function notFound(): never {
  throw Object.assign(new Error('Project not found'), { statusCode: 404 })
}

export async function listProjects(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isGlobalAdmin: true },
  })
  // Global admins see all projects; regular users only see projects they're a member of
  if (user?.isGlobalAdmin) {
    return prisma.project.findMany({ orderBy: { createdAt: 'desc' } })
  }
  const memberships = await prisma.membership.findMany({
    where: { userId },
    select: { projectId: true },
  })
  const projectIds = memberships.map((m) => m.projectId)
  return prisma.project.findMany({
    where: { id: { in: projectIds } },
    orderBy: { createdAt: 'desc' },
  })
}

export async function getProject(id: string) {
  const project = await prisma.project.findUnique({ where: { id } })
  if (!project) notFound()
  // Never expose the raw (encrypted) key to clients: just signal presence
  return { ...project, aiApiKey: project.aiApiKey ? '***' : null }
}

export async function createProject(data: CreateProjectInput) {
  const existing = await prisma.project.findUnique({
    where: { slug: data.slug },
  })
  if (existing) throw Object.assign(new Error('Slug already taken'), { statusCode: 409 })
  return prisma.project.create({ data })
}

export async function updateProject(id: string, data: UpdateProjectInput) {
  await getProject(id)
  if (data.slug) {
    const existing = await prisma.project.findFirst({
      where: { slug: data.slug, NOT: { id } },
    })
    if (existing) throw Object.assign(new Error('Slug already taken'), { statusCode: 409 })
  }
  // Encrypt AI API key before persisting; skip if unchanged (masked placeholder)
  const payload: typeof data = { ...data }
  if (payload.aiApiKey === '***' || payload.aiApiKey === '') {
    delete payload.aiApiKey // don't overwrite the stored key
  } else if (payload.aiApiKey && !isEncrypted(payload.aiApiKey)) {
    payload.aiApiKey = encrypt(payload.aiApiKey)
  }
  return prisma.project.update({ where: { id }, data: payload })
}

export async function deleteProject(id: string) {
  await getProject(id)
  await prisma.project.delete({ where: { id } })
}
