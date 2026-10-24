import { prisma } from '../prisma.js'
import { AccountRole } from '../types.js'
import type { AddAccountMemberInput, CreateAccountInput, UpdateAccountInput } from '../schemas/account.schema.js'
import { isOperator, recordInstanceAudit } from './operator.service.js'

// Accounts are the tenant level above projects (fleet standard, "Every rail
// has the same anatomy" in the workspace AGENTS.md). Every project belongs to
// one account, and nobody reaches a project without being a member of its
// account as well as of the project (acl.service.ts).
//
// Only the people Platform marks as admins of this app (the app-level `role`
// claim, stored as User.platformRole at sign-in) create accounts, plus the
// instance operators named in VERBA_OPERATORS, who are the same people on an
// instance without Platform sign-in. Someone signing in for the first time
// joins no account. An account's owners and admins add people to it.
//
// Account changes are written to InstanceAuditLog: AuditLog belongs to a
// project, and these belong to no project.

const ROLE_WEIGHT: Record<string, number> = {
  [AccountRole.OWNER]: 3,
  [AccountRole.ADMIN]: 2,
  [AccountRole.MEMBER]: 1,
}

function fail(statusCode: number, message: string, details?: Record<string, unknown>): never {
  throw Object.assign(new Error(message), { statusCode, ...(details ? { details } : {}) })
}

/** Whether this person may create accounts: a Platform admin of this app, or an instance operator. */
export async function canCreateAccounts(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { platformRole: true, deactivatedAt: true },
  })
  if (!user || user.deactivatedAt != null) return false
  if (user.platformRole === 'admin') return true
  return isOperator(userId)
}

/**
 * The caller's membership of an account at `minRole` or above.
 *
 * Not a member: 404, the same answer as an account that does not exist, so
 * nobody can probe for other accounts. A member below the role: 403.
 */
export async function requireAccountRole(userId: string, accountId: string, minRole: AccountRole) {
  const membership = await prisma.accountMember.findUnique({
    where: { userId_accountId: { userId, accountId } },
  })
  if (!membership) fail(404, 'Account not found')
  if ((ROLE_WEIGHT[membership.role] ?? 0) < (ROLE_WEIGHT[minRole] ?? 0)) fail(403, 'Forbidden')
  return membership
}

/** The accounts this person belongs to, with their role and how many projects each holds. */
export async function listAccounts(userId: string) {
  const memberships = await prisma.accountMember.findMany({
    where: { userId },
    include: { account: { include: { _count: { select: { projects: true } } } } },
    orderBy: { account: { name: 'asc' } },
  })
  return memberships.map((m) => ({
    id: m.account.id,
    name: m.account.name,
    slug: m.account.slug,
    role: m.role,
    projectCount: m.account._count.projects,
  }))
}

/**
 * The account a request works in.
 *
 * The caller names it (id or slug) with the X-Verba-Account header or an
 * `account` query parameter. With none named, a person in exactly one account
 * works in it, which is what keeps every client written before accounts
 * working unchanged. Several accounts and none named is a 400 listing them.
 * An account the caller is not in is a 404, like one that does not exist.
 */
export async function resolveAccount(userId: string, selector?: string | null) {
  const named = selector?.trim()
  if (named) {
    const membership = await prisma.accountMember.findFirst({
      where: { userId, account: { OR: [{ id: named }, { slug: named }] } },
      include: { account: true },
    })
    if (!membership) fail(404, 'Account not found')
    return { ...membership.account, role: membership.role }
  }
  const memberships = await prisma.accountMember.findMany({
    where: { userId },
    include: { account: true },
    take: 50,
  })
  if (memberships.length === 0) fail(404, 'You are not in any account yet')
  if (memberships.length > 1) {
    fail(400, 'Name the account: send X-Verba-Account with its id or slug', {
      accounts: memberships.map((m) => ({ id: m.account.id, slug: m.account.slug, name: m.account.name })),
    })
  }
  const only = memberships[0]!
  return { ...only.account, role: only.role }
}

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'account'
  )
}

async function freeSlug(base: string): Promise<string> {
  let candidate = base
  for (let i = 2; i < 1000; i++) {
    const taken = await prisma.account.findUnique({ where: { slug: candidate } })
    if (!taken) return candidate
    candidate = `${base}-${i}`
  }
  fail(409, 'Could not allocate a unique slug')
}

/** A new account, owned by whoever creates it. Reserved for Platform admins and operators. */
export async function createAccount(actorId: string, data: CreateAccountInput) {
  if (!(await canCreateAccounts(actorId))) {
    fail(403, 'Only Verba administrators can create accounts')
  }
  return createOwnedAccount(actorId, data)
}

/**
 * Create an account owned by `ownerId`, without the creator check. For the
 * first-run setup, which has already proved the person is an operator.
 */
export async function createOwnedAccount(ownerId: string, data: CreateAccountInput) {
  let slug: string
  if (data.slug) {
    if (await prisma.account.findUnique({ where: { slug: data.slug } })) fail(409, 'Slug already taken')
    slug = data.slug
  } else {
    slug = await freeSlug(slugify(data.name))
  }
  const account = await prisma.account.create({
    data: {
      name: data.name,
      slug,
      members: { create: { userId: ownerId, role: AccountRole.OWNER } },
    },
  })
  await recordInstanceAudit({
    actorId: ownerId,
    action: 'account.created',
    detail: { accountId: account.id, name: account.name, slug: account.slug },
  })
  return { id: account.id, name: account.name, slug: account.slug, role: AccountRole.OWNER, projectCount: 0 }
}

/** The account as its members see it: name, the caller's role, and the people in it. */
export async function getAccount(userId: string, accountId: string) {
  const membership = await requireAccountRole(userId, accountId, AccountRole.MEMBER)
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    include: { _count: { select: { projects: true } } },
  })
  if (!account) fail(404, 'Account not found')
  return {
    id: account.id,
    name: account.name,
    slug: account.slug,
    createdAt: account.createdAt,
    role: membership.role,
    projectCount: account._count.projects,
  }
}

export async function updateAccount(actorId: string, accountId: string, data: UpdateAccountInput) {
  await requireAccountRole(actorId, accountId, AccountRole.ADMIN)
  const account = await prisma.account.update({ where: { id: accountId }, data: { name: data.name } })
  await recordInstanceAudit({ actorId, action: 'account.renamed', detail: { accountId, name: data.name } })
  return { id: account.id, name: account.name, slug: account.slug }
}

export async function listMembers(actorId: string, accountId: string) {
  await requireAccountRole(actorId, accountId, AccountRole.MEMBER)
  const members = await prisma.accountMember.findMany({
    where: { accountId },
    include: { user: { select: { id: true, email: true, name: true, avatarUrl: true, deactivatedAt: true } } },
    orderBy: { createdAt: 'asc' },
  })
  return members.map((m) => ({
    userId: m.userId,
    role: m.role,
    createdAt: m.createdAt,
    email: m.user.email,
    name: m.user.name,
    avatarUrl: m.user.avatarUrl,
    deactivated: m.user.deactivatedAt != null,
  }))
}

async function ownerCount(accountId: string): Promise<number> {
  return prisma.accountMember.count({ where: { accountId, role: AccountRole.OWNER } })
}

/** Add someone who has signed in to Verba once, by email. Admins add, only owners add owners. */
export async function addMember(actorId: string, accountId: string, data: AddAccountMemberInput) {
  const actor = await requireAccountRole(actorId, accountId, AccountRole.ADMIN)
  if (data.role === AccountRole.OWNER && actor.role !== AccountRole.OWNER) fail(403, 'Only an owner can add an owner')
  const user = await prisma.user.findUnique({
    where: { email: data.email.trim().toLowerCase() },
    select: { id: true, deactivatedAt: true },
  })
  if (!user || user.deactivatedAt != null) {
    fail(404, 'Nobody with that email has signed in to Verba yet. Ask them to sign in once first.')
  }
  const existing = await prisma.accountMember.findUnique({
    where: { userId_accountId: { userId: user.id, accountId } },
  })
  if (existing) fail(409, 'Already a member of this account')
  const member = await prisma.accountMember.create({ data: { userId: user.id, accountId, role: data.role } })
  await recordInstanceAudit({
    actorId,
    action: 'account.member.added',
    targetUserId: user.id,
    detail: { accountId, role: data.role },
  })
  return member
}

/** Change a member's role. Admins change roles below owner, and only owners make or unmake owners. */
export async function updateMemberRole(actorId: string, accountId: string, userId: string, role: AccountRole) {
  const actor = await requireAccountRole(actorId, accountId, AccountRole.ADMIN)
  const target = await prisma.accountMember.findUnique({ where: { userId_accountId: { userId, accountId } } })
  if (!target) fail(404, 'Member not found')
  const touchesOwner = target.role === AccountRole.OWNER || role === AccountRole.OWNER
  if (touchesOwner && actor.role !== AccountRole.OWNER) fail(403, 'Only an owner can change an owner')
  if (target.role === AccountRole.OWNER && role !== AccountRole.OWNER && (await ownerCount(accountId)) <= 1) {
    fail(409, 'An account needs at least one owner')
  }
  const member = await prisma.accountMember.update({
    where: { userId_accountId: { userId, accountId } },
    data: { role },
  })
  await recordInstanceAudit({
    actorId,
    action: 'account.member.role_changed',
    targetUserId: userId,
    detail: { accountId, from: target.role, to: role },
  })
  return member
}

/**
 * Take someone out of an account: admins remove members and admins, owners
 * remove anyone, and anyone may leave. The last owner cannot go. Leaving the
 * account also ends every project membership in it, so nothing is left behind
 * that a later re-invitation would silently restore.
 */
export async function removeMember(actorId: string, accountId: string, userId: string) {
  const self = actorId === userId
  const actor = await requireAccountRole(actorId, accountId, self ? AccountRole.MEMBER : AccountRole.ADMIN)
  const target = self
    ? actor
    : await prisma.accountMember.findUnique({ where: { userId_accountId: { userId, accountId } } })
  if (!target) fail(404, 'Member not found')
  if (target.role === AccountRole.OWNER) {
    if (!self && actor.role !== AccountRole.OWNER) fail(403, 'Only an owner can remove an owner')
    if ((await ownerCount(accountId)) <= 1) fail(409, 'An account needs at least one owner')
  }
  await prisma.$transaction([
    prisma.membership.deleteMany({ where: { userId, project: { accountId } } }),
    prisma.accountMember.delete({ where: { userId_accountId: { userId, accountId } } }),
  ])
  await recordInstanceAudit({
    actorId,
    action: self ? 'account.member.left' : 'account.member.removed',
    targetUserId: userId,
    detail: { accountId },
  })
}

/**
 * Make sure the person being added to a project is in the project's account.
 *
 * Already a member: nothing to do. Otherwise the actor must be an admin of the
 * account (account owners add people), and the person joins it as a member.
 */
export async function ensureMemberForProject(actorId: string, projectId: string, userId: string) {
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { accountId: true } })
  if (!project) fail(404, 'Project not found')
  const existing = await prisma.accountMember.findUnique({
    where: { userId_accountId: { userId, accountId: project.accountId } },
  })
  if (existing) return
  const actor = await prisma.accountMember.findUnique({
    where: { userId_accountId: { userId: actorId, accountId: project.accountId } },
  })
  if (!actor || (ROLE_WEIGHT[actor.role] ?? 0) < ROLE_WEIGHT[AccountRole.ADMIN]!) {
    fail(403, 'This person is not in the account yet. Ask an account owner or admin to add them.')
  }
  await prisma.accountMember.create({
    data: { userId, accountId: project.accountId, role: AccountRole.MEMBER },
  })
  await recordInstanceAudit({
    actorId,
    action: 'account.member.added',
    targetUserId: userId,
    detail: { accountId: project.accountId, role: AccountRole.MEMBER, via: 'project', projectId },
  })
}
