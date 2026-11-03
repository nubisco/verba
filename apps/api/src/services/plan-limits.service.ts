// Plan limits on creation, for an account on a hosted plan.
//
// The services call assertWithinLimit before they create a project, add a
// person to an account, create translation keys, or add a locale. It refuses with 402 and a
// `plan_limit` body when the account's plan would be exceeded, and the web app
// turns that into one upgrade prompt.
//
// It refuses nothing unless this instance sells hosted plans: EE enabled, and
// the EE plans module configured against Nubisco's licenses service. On a
// Community or self-hosted instance it returns at once, before counting
// anything. The limits themselves come from EE (`accountLimits`), and the
// counts from here.
//
// Only creation is checked. Nothing is ever deleted or blocked for being over
// a limit already, for example after a downgrade.

import { prisma } from '../prisma.js'
import { eeEnabled, loadEE } from './edition.service.js'

// Locales are counted as the distinct locale codes across the account's
// projects: a project translating into pt-PT that another project already
// translates into adds no locale to the account. Keys, members and projects
// are plain counts across the account.
export type LimitedResource = 'projects' | 'members' | 'keys' | 'locales'

export interface PlanLimitDetail {
  code: 'plan_limit'
  resource: LimitedResource
  limit: number
  current: number
  adding: number
}

const NOUNS: Record<LimitedResource, [string, string]> = {
  projects: ['project', 'projects'],
  members: ['member', 'members'],
  keys: ['translation key', 'translation keys'],
  locales: ['locale', 'locales'],
}

function count(n: number, resource: LimitedResource): string {
  const [one, many] = NOUNS[resource]
  return `${n.toLocaleString('en')} ${n === 1 ? one : many}`
}

/** The words of the refusal, the same wherever it is shown. */
export function planLimitMessage(resource: LimitedResource, limit: number, current: number, adding: number): string {
  const has = `This account's plan allows ${count(limit, resource)}, and it has ${current.toLocaleString('en')}.`
  const would = adding > 1 ? ` This would add ${adding.toLocaleString('en')} more.` : ''
  return `${has}${would} Upgrade the plan to add more.`
}

/** The account's limits when hosted plans are on, else null (nothing to enforce). */
async function limitsOf(accountId: string): Promise<Record<LimitedResource, number | null> | null> {
  if (!eeEnabled()) return null
  const ee = await loadEE()
  if (typeof ee?.accountLimits !== 'function') return null
  return (await ee.accountLimits(prisma, accountId)) ?? null
}

/** Whether limits are enforced for this account. */
export async function plansEnforced(accountId: string): Promise<boolean> {
  return (await limitsOf(accountId)) !== null
}

async function currentCount(accountId: string, resource: LimitedResource): Promise<number> {
  if (resource === 'projects') return prisma.project.count({ where: { accountId } })
  if (resource === 'members') return prisma.accountMember.count({ where: { accountId } })
  if (resource === 'locales') return (await localeCodesOf(accountId)).size
  return prisma.key.count({ where: { project: { accountId } } })
}

/** The distinct locale codes the account's projects translate into. */
async function localeCodesOf(accountId: string): Promise<Set<string>> {
  const rows = await prisma.locale.findMany({
    where: { project: { accountId } },
    select: { code: true },
    distinct: ['code'],
  })
  return new Set(rows.map((r) => r.code))
}

/**
 * Refuses a creation that would take the account past its plan's limit.
 * `adding` is how many the change creates (an import can create many keys).
 */
export async function assertWithinLimit(accountId: string, resource: LimitedResource, adding = 1): Promise<void> {
  if (adding <= 0) return
  const limits = await limitsOf(accountId)
  const limit = limits?.[resource]
  if (limit === null || limit === undefined) return
  const current = await currentCount(accountId, resource)
  if (current + adding <= limit) return
  const details: PlanLimitDetail = { code: 'plan_limit', resource, limit, current, adding }
  throw Object.assign(new Error(planLimitMessage(resource, limit, current, adding)), { statusCode: 402, details })
}

/** The same check for a project's account. */
export async function assertProjectWithinLimit(projectId: string, resource: LimitedResource, adding = 1) {
  if (adding <= 0 || !eeEnabled()) return
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { accountId: true } })
  if (project) await assertWithinLimit(project.accountId, resource, adding)
}

/**
 * How many of these keys do not exist in the project yet, keyed by namespace
 * slug and key name. For an import, which creates the missing ones. Counted
 * only when hosted plans are on.
 */
export async function newKeyCount(projectId: string, keys: { namespaceSlug: string; name: string }[]): Promise<number> {
  const wanted = new Set(keys.map((k) => `${k.namespaceSlug}\u0000${k.name}`))
  if (wanted.size === 0) return 0
  const existing = await prisma.key.findMany({
    where: { projectId, name: { in: [...new Set(keys.map((k) => k.name))] } },
    select: { name: true, namespace: { select: { slug: true } } },
  })
  for (const k of existing) wanted.delete(`${k.namespace.slug}\u0000${k.name}`)
  return wanted.size
}

/**
 * Refuses an import, before it writes anything, when the keys it would create
 * take the project's account past its plan. Keys that exist already are
 * updated, not created, so they do not count.
 */
export async function assertKeysFit(projectId: string, keys: { namespaceSlug: string; name: string }[]): Promise<void> {
  if (keys.length === 0 || !eeEnabled()) return
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { accountId: true } })
  if (!project || !(await plansEnforced(project.accountId))) return
  await assertWithinLimit(project.accountId, 'keys', await newKeyCount(projectId, keys))
}

// ── Read-only while over a limit ────────────────────────────────────────────
//
// A hosted account over any of its plan's limits (Pro gone back to Free, say)
// is read-only until it is back under every limit or upgrades. Nothing is
// deleted. Reading and exporting keep working, and so do deleting and removing
// people, which is how an owner gets back under, and billing, which is how
// they upgrade. The write guard (read-only.ts) asks assertWritable before any
// other write in the account.

export interface OverLimit {
  resource: LimitedResource
  limit: number
  current: number
}

const ENFORCED: LimitedResource[] = ['projects', 'members', 'keys', 'locales']

/** The limits the account is over now. Empty without hosted plans. */
export async function overLimits(accountId: string): Promise<OverLimit[]> {
  const limits = await limitsOf(accountId)
  if (!limits) return []
  const over: OverLimit[] = []
  for (const resource of ENFORCED) {
    const limit = limits[resource]
    if (limit === null || limit === undefined) continue
    const current = await currentCount(accountId, resource)
    if (current > limit) over.push({ resource, limit, current })
  }
  return over
}

function joined(parts: string[]): string {
  return parts.length <= 1 ? (parts[0] ?? '') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
}

/** "It has 12 projects, and the plan allows 10." For the banner and the refusal alike. */
export function overLimitSummary(over: OverLimit[]): string {
  const has = joined(over.map((o) => count(o.current, o.resource)))
  const allows = joined(
    over.map((o) => (over.length === 1 ? o.limit.toLocaleString('en') : count(o.limit, o.resource))),
  )
  return `It has ${has}, and the plan allows ${allows}.`
}

export function readOnlyMessage(over: OverLimit[]): string {
  return `This account is read-only. ${overLimitSummary(over)} Nothing was deleted, and everyone can still read and export. Delete some, or upgrade the plan, to make changes again.`
}

/** Refuses a write in an account that is over its plan. */
export async function assertWritable(accountId: string): Promise<void> {
  if (!eeEnabled()) return
  const over = await overLimits(accountId)
  if (over.length === 0) return
  const first = over[0]!
  throw Object.assign(new Error(readOnlyMessage(over)), {
    statusCode: 402,
    details: {
      code: 'plan_limit',
      readOnly: true,
      over,
      resource: first.resource,
      limit: first.limit,
      current: first.current,
    },
  })
}

/** The account a project belongs to, or null when there is no such project. */
export async function accountOfProject(projectId: string): Promise<string | null> {
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { accountId: true } })
  return project?.accountId ?? null
}

/**
 * Refuses adding these locale codes to a project, before anything is written,
 * when the ones new to the account take it past its plan. A code another
 * project in the account already has adds nothing.
 */
export async function assertLocalesFit(projectId: string, codes: string[]): Promise<void> {
  if (codes.length === 0 || !eeEnabled()) return
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { accountId: true } })
  if (!project) return
  // Unlimited (Pro), or no hosted plan: nothing to count.
  const limit = (await limitsOf(project.accountId))?.locales
  if (limit === null || limit === undefined) return
  const held = await localeCodesOf(project.accountId)
  const adding = new Set(codes.filter((c) => !held.has(c))).size
  await assertWithinLimit(project.accountId, 'locales', adding)
}
