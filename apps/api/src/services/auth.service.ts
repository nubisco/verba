import bcrypt from 'bcryptjs'
import { prisma } from '../prisma.js'

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
  const isFirstUser = (await prisma.user.count()) === 0
  const user = await prisma.user.create({
    data: { email, passwordHash, name: name ?? undefined, isGlobalAdmin: isFirstUser },
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
    isGlobalAdmin: user.isGlobalAdmin,
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
    isGlobalAdmin: user.isGlobalAdmin,
    createdAt: user.createdAt,
    preferredLocales,
    notificationOpenMode: user.notificationOpenMode,
  }
}

export async function deactivateUser(targetUserId: string, actorUserId: string) {
  const actor = await prisma.user.findUnique({ where: { id: actorUserId } })
  if (!actor) notFound()
  if (!actor.isGlobalAdmin && actorUserId !== targetUserId) {
    throw Object.assign(new Error('Forbidden'), { statusCode: 403 })
  }
  return prisma.user.update({
    where: { id: targetUserId },
    data: { deactivatedAt: new Date() },
  })
}

export async function reactivateUser(targetUserId: string, actorUserId: string) {
  const actor = await prisma.user.findUnique({ where: { id: actorUserId } })
  if (!actor || !actor.isGlobalAdmin) {
    throw Object.assign(new Error('Forbidden'), { statusCode: 403 })
  }
  return prisma.user.update({
    where: { id: targetUserId },
    data: { deactivatedAt: null },
  })
}

export async function deleteUser(targetUserId: string, actorUserId: string, reassignToUserId?: string) {
  const actor = await prisma.user.findUnique({ where: { id: actorUserId } })
  if (!actor) notFound()
  if (!actor.isGlobalAdmin && actorUserId !== targetUserId) {
    throw Object.assign(new Error('Forbidden'), { statusCode: 403 })
  }
  const target = await prisma.user.findUnique({ where: { id: targetUserId } })
  if (!target) notFound()

  if (target.isGlobalAdmin) {
    const otherAdmins = await prisma.user.count({
      where: {
        isGlobalAdmin: true,
        deactivatedAt: null,
        id: { not: targetUserId },
      },
    })
    if (otherAdmins === 0) {
      throw Object.assign(new Error('Last active global admin cannot be deleted'), {
        statusCode: 403,
      })
    }
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
}

export async function listAllUsers() {
  return prisma.user.findMany({
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
}
