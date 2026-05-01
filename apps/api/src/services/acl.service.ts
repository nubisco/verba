import { Role, Status } from '../types.js'
import { prisma } from '../prisma.js'
import { getMembership, ROLE_WEIGHT } from './membership.service.js'

export function canTransitionStatus(role: string, from: string, to: string): boolean {
  const translatorTransitions =
    (from === Status.TODO && to === Status.IN_PROGRESS) ||
    (from === Status.IN_PROGRESS && to === Status.TODO) || // unstart
    (from === Status.IN_PROGRESS && to === Status.SUBMITTED)

  const maintainerTransitions =
    (from === Status.SUBMITTED && to === Status.APPROVED) ||
    (from === Status.SUBMITTED && to === Status.IN_PROGRESS) ||
    (from === Status.APPROVED && to === Status.IN_PROGRESS)

  if (role === Role.TRANSLATOR) return translatorTransitions
  if (role === Role.MAINTAINER) return translatorTransitions || maintainerTransitions
  if (role === Role.ADMIN) return translatorTransitions || maintainerTransitions
  return false
}

export async function requireProjectRole(userId: string, projectId: string, minRole: string) {
  // Global admins bypass project membership checks
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isGlobalAdmin: true },
  })
  if (user?.isGlobalAdmin) {
    return {
      userId,
      projectId,
      role: Role.ADMIN,
      namespaces: [] as string[],
      id: '',
      createdAt: new Date(),
    }
  }
  const membership = await getMembership(userId, projectId)
  if (!membership) {
    throw Object.assign(new Error('Forbidden'), { statusCode: 403 })
  }
  if ((ROLE_WEIGHT[membership.role] ?? 0) < (ROLE_WEIGHT[minRole] ?? 0)) {
    throw Object.assign(new Error('Forbidden'), { statusCode: 403 })
  }
  return membership
}

export function canWriteNamespace(membership: { role: string; namespaces: string[] }, namespaceId: string): boolean {
  if (membership.role === Role.READER) return false
  if (membership.role === Role.ADMIN || membership.role === Role.MAINTAINER) return true
  // TRANSLATOR: allowed if namespaces list is empty (all) or includes namespaceId
  return membership.namespaces.length === 0 || membership.namespaces.includes(namespaceId)
}
