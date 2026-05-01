import { prisma } from '../prisma.js'
import { Role } from '../types.js'
import type { AddMemberInput, UpdateMemberInput } from '../schemas/member.schema.js'

const ROLE_WEIGHT: Record<string, number> = {
  [Role.ADMIN]: 4,
  [Role.MAINTAINER]: 3,
  [Role.TRANSLATOR]: 2,
  [Role.READER]: 1,
}

export function parseNamespaces(raw: string): string[] {
  try {
    return JSON.parse(raw)
  } catch {
    return []
  }
}

export function parseLocales(raw: string): string[] {
  try {
    return JSON.parse(raw)
  } catch {
    return []
  }
}

export async function listMembers(projectId: string) {
  const members = await prisma.membership.findMany({
    where: { projectId },
    include: { user: { select: { id: true, email: true } } },
  })
  return members.map((m) => ({
    ...m,
    namespaces: parseNamespaces(m.namespaces),
    assignedLocales: parseLocales(m.assignedLocales),
  }))
}

export async function addMember(projectId: string, data: AddMemberInput) {
  const { userId, role, namespaceIds = [] } = data
  const m = await prisma.membership.upsert({
    where: { userId_projectId: { userId, projectId } },
    create: {
      userId,
      projectId,
      role,
      namespaces: JSON.stringify(namespaceIds),
    },
    update: { role, namespaces: JSON.stringify(namespaceIds) },
  })
  return {
    ...m,
    namespaces: parseNamespaces(m.namespaces),
    assignedLocales: parseLocales(m.assignedLocales),
  }
}

export async function updateMember(projectId: string, userId: string, data: UpdateMemberInput) {
  const existing = await prisma.membership.findUnique({
    where: { userId_projectId: { userId, projectId } },
  })
  if (!existing) throw Object.assign(new Error('Membership not found'), { statusCode: 404 })
  const role = data.role ?? existing.role
  const namespaces = data.namespaceIds !== undefined ? JSON.stringify(data.namespaceIds) : existing.namespaces
  const m = await prisma.membership.update({
    where: { userId_projectId: { userId, projectId } },
    data: { role, namespaces },
  })
  return {
    ...m,
    namespaces: parseNamespaces(m.namespaces),
    assignedLocales: parseLocales(m.assignedLocales),
  }
}

export async function updateMemberLocales(projectId: string, userId: string, localeIds: string[]) {
  const existing = await prisma.membership.findUnique({
    where: { userId_projectId: { userId, projectId } },
  })
  if (!existing) throw Object.assign(new Error('Membership not found'), { statusCode: 404 })
  const m = await prisma.membership.update({
    where: { userId_projectId: { userId, projectId } },
    data: { assignedLocales: JSON.stringify(localeIds) },
  })
  return {
    ...m,
    namespaces: parseNamespaces(m.namespaces),
    assignedLocales: parseLocales(m.assignedLocales),
  }
}

export async function removeMember(projectId: string, userId: string) {
  const existing = await prisma.membership.findUnique({
    where: { userId_projectId: { userId, projectId } },
  })
  if (!existing) throw Object.assign(new Error('Membership not found'), { statusCode: 404 })
  await prisma.membership.delete({
    where: { userId_projectId: { userId, projectId } },
  })
}

export async function getMembership(userId: string, projectId: string) {
  const m = await prisma.membership.findUnique({
    where: { userId_projectId: { userId, projectId } },
  })
  if (!m) return null
  return {
    ...m,
    namespaces: parseNamespaces(m.namespaces),
    assignedLocales: parseLocales(m.assignedLocales),
  }
}

export { ROLE_WEIGHT }
