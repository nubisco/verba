import { prisma } from '../prisma.js'

// Instance operators: the people who run this Verba, not the people who use
// it. They manage accounts (deactivate, reactivate, delete) and see the
// instance's plan and entitlements. They do not get into anyone's projects:
// project access is project membership, for operators as for everyone else.
//
// Who is an operator is configuration, VERBA_OPERATORS, a comma-separated
// list of email addresses. It used to be "whoever signed up first", which on
// a host where strangers can sign up is a race for the keys. Every decision
// reads the configuration live. User.isGlobalAdmin is a cache of it, synced
// at sign-in, and every change to that cache is written to InstanceAuditLog.

export function operatorEmails(value: string | undefined = process.env.VERBA_OPERATORS): Set<string> {
  return new Set(
    (value ?? '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  )
}

export function isOperatorEmail(email: string | null | undefined): boolean {
  return !!email && operatorEmails().has(email.trim().toLowerCase())
}

/** Whether an account, by id, is an active operator right now. */
export async function isOperator(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, deactivatedAt: true } })
  return !!user && user.deactivatedAt == null && isOperatorEmail(user.email)
}

export async function recordInstanceAudit(entry: {
  actorId?: string | null
  action: string
  targetUserId?: string | null
  detail?: Record<string, unknown>
}): Promise<void> {
  await prisma.instanceAuditLog.create({
    data: {
      actorId: entry.actorId ?? null,
      action: entry.action,
      targetUserId: entry.targetUserId ?? null,
      detail: entry.detail ? JSON.stringify(entry.detail) : null,
    },
  })
}

/**
 * Bring an account's cached operator flag in line with VERBA_OPERATORS, and
 * record the grant or revocation. Called at every sign-in.
 */
export async function syncOperatorFlag(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, isGlobalAdmin: true } })
  if (!user) return
  const shouldBe = isOperatorEmail(user.email)
  if (user.isGlobalAdmin === shouldBe) return
  await prisma.user.update({ where: { id: userId }, data: { isGlobalAdmin: shouldBe } })
  await recordInstanceAudit({
    action: shouldBe ? 'operator.granted' : 'operator.revoked',
    targetUserId: userId,
    detail: { email: user.email, source: 'VERBA_OPERATORS' },
  })
}

export async function listInstanceAudit(limit = 200) {
  return prisma.instanceAuditLog.findMany({ orderBy: { createdAt: 'desc' }, take: Math.min(Math.max(limit, 1), 500) })
}
