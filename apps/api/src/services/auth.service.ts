import bcrypt from 'bcryptjs'
import { prisma } from '../prisma.js'
import { isOperatorEmail, recordInstanceAudit } from './operator.service.js'

function unauthorized(): never {
  throw Object.assign(new Error('Invalid email or password'), {
    statusCode: 401,
  })
}

function notFound(): never {
  throw Object.assign(new Error('User not found'), { statusCode: 404 })
}

export async function register(email: string, password: string) {
  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) throw Object.assign(new Error('Email already in use'), { statusCode: 409 })
  return createLocalUser(email, await bcrypt.hash(password, 10))
}

export async function createOtpOnlyUser(email: string, name?: string | null) {
  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) throw Object.assign(new Error('Email already in use'), { statusCode: 409 })
  return createLocalUser(email, '', name)
}

async function createLocalUser(email: string, passwordHash: string, name?: string | null) {
  // Nobody becomes an operator by arriving first: see operator.service.ts.
  const user = await prisma.user.create({
    data: { email, passwordHash, name: name ?? undefined, isGlobalAdmin: false },
    select: { id: true, email: true, isGlobalAdmin: true, createdAt: true },
  })
  return user
}

export async function login(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } })
  if (!user) unauthorized()
  if (!user.passwordHash) unauthorized()
  const valid = await bcrypt.compare(password, user.passwordHash)
  if (!valid) unauthorized()
  if (user.deactivatedAt != null) {
    throw Object.assign(new Error('Account is deactivated. Contact an administrator.'), {
      statusCode: 403,
    })
  }
  return {
    userId: user.id,
    email: user.email,
    isGlobalAdmin: isOperatorEmail(user.email),
  }
}

export async function updateProfile(
  userId: string,
  data: {
    email?: string
    name?: string
    currentPassword?: string
    newPassword?: string
    preferredLocales?: string[]
    notificationOpenMode?: string
  },
) {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) notFound()

  const updates: Record<string, unknown> = {}

  if (data.name !== undefined) {
    updates.name = data.name
  }

  if (data.preferredLocales !== undefined) {
    updates.preferredLocales = JSON.stringify(data.preferredLocales)
  }

  if (data.notificationOpenMode !== undefined) {
    updates.notificationOpenMode = data.notificationOpenMode
  }

  if (data.email && data.email !== user.email) {
    const conflict = await prisma.user.findUnique({
      where: { email: data.email },
    })
    if (conflict)
      throw Object.assign(new Error('Email already in use'), {
        statusCode: 409,
      })
    updates.email = data.email
  }

  if (data.newPassword) {
    if (!data.currentPassword) {
      throw Object.assign(new Error('currentPassword is required to set a new password'), {
        statusCode: 400,
      })
    }
    const valid = await bcrypt.compare(data.currentPassword, user.passwordHash)
    if (!valid)
      throw Object.assign(new Error('Current password is incorrect'), {
        statusCode: 403,
      })
    updates.passwordHash = await bcrypt.hash(data.newPassword, 10)
  }

  if (Object.keys(updates).length === 0) return getMe(userId)

  await prisma.user.update({ where: { id: userId }, data: updates })
  return getMe(userId)
}

export async function getMe(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) notFound()
  let preferredLocales: string[] = []
  try {
    preferredLocales = JSON.parse(user.preferredLocales)
  } catch {
    /* ignore */
  }
  return {
    id: user.id,
    email: user.email,
    name: user.name ?? null,
    // Operator, read live from VERBA_OPERATORS. The name is kept for the web app.
    isGlobalAdmin: isOperatorEmail(user.email),
    createdAt: user.createdAt,
    preferredLocales,
    notificationOpenMode: user.notificationOpenMode,
    // The Platform avatar, or null for initials.
    avatarUrl: user.avatarUrl ?? null,
  }
}

export async function deactivateUser(targetUserId: string, actorUserId: string) {
  const actor = await prisma.user.findUnique({ where: { id: actorUserId } })
  if (!actor) notFound()
  const self = actorUserId === targetUserId
  if (!isOperatorEmail(actor.email) && !self) {
    throw Object.assign(new Error('Forbidden'), { statusCode: 403 })
  }
  const updated = await prisma.user.update({
    where: { id: targetUserId },
    data: { deactivatedAt: new Date() },
  })
  if (!self) await recordInstanceAudit({ actorId: actorUserId, action: 'user.deactivated', targetUserId })
  return updated
}

export async function reactivateUser(targetUserId: string, actorUserId: string) {
  const actor = await prisma.user.findUnique({ where: { id: actorUserId } })
  if (!actor || !isOperatorEmail(actor.email)) {
    throw Object.assign(new Error('Forbidden'), { statusCode: 403 })
  }
  const updated = await prisma.user.update({
    where: { id: targetUserId },
    data: { deactivatedAt: null },
  })
  await recordInstanceAudit({ actorId: actorUserId, action: 'user.reactivated', targetUserId })
  return updated
}

export async function deleteUser(targetUserId: string, actorUserId: string, reassignToUserId?: string) {
  const actor = await prisma.user.findUnique({ where: { id: actorUserId } })
  if (!actor) notFound()
  if (!isOperatorEmail(actor.email) && actorUserId !== targetUserId) {
    throw Object.assign(new Error('Forbidden'), { statusCode: 403 })
  }
  const target = await prisma.user.findUnique({ where: { id: targetUserId } })
  if (!target) notFound()

  // An operator is named in VERBA_OPERATORS, so the account goes from there
  // first. Deleting it here would leave a configured operator with no account.
  if (isOperatorEmail(target.email)) {
    throw Object.assign(new Error('Remove this address from VERBA_OPERATORS before deleting the account'), {
      statusCode: 403,
    })
  }

  if (reassignToUserId) {
    await prisma.translation.updateMany({
      where: { assignedToId: targetUserId },
      data: { assignedToId: reassignToUserId },
    })
  }

  await prisma.membership.deleteMany({ where: { userId: targetUserId } })
  await prisma.user.update({
    where: { id: targetUserId },
    data: { deactivatedAt: new Date() },
  })
  await recordInstanceAudit({
    actorId: actorUserId,
    action: 'user.deleted',
    targetUserId,
    detail: reassignToUserId ? { reassignedTo: reassignToUserId } : undefined,
  })
}

/**
 * The people a signed-in user may look up: those who already share a project
 * with them. It used to search every account on the instance, which on a
 * shared host is a directory of every customer's staff.
 */
export async function searchCoMembers(callerId: string, emailFragment: string) {
  const fragment = emailFragment.trim().toLowerCase()
  if (fragment.length < 2) return []
  const mine = await prisma.membership.findMany({ where: { userId: callerId }, select: { projectId: true } })
  if (mine.length === 0) return []
  return prisma.user.findMany({
    where: {
      email: { contains: fragment },
      deactivatedAt: null,
      memberships: { some: { projectId: { in: mine.map((m) => m.projectId) } } },
    },
    select: { id: true, email: true, name: true },
    take: 10,
  })
}

/** An active account by exact address, for adding a member. Null when there is none. */
export async function findActiveUserByEmail(email: string) {
  const user = await prisma.user.findUnique({
    where: { email: email.trim().toLowerCase() },
    select: { id: true, deactivatedAt: true },
  })
  return user && user.deactivatedAt == null ? { id: user.id } : null
}

export async function listAllUsers() {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      name: true,
      isGlobalAdmin: true,
      deactivatedAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'asc' },
  })
  return users.map((u) => ({ ...u, isGlobalAdmin: isOperatorEmail(u.email) }))
}
