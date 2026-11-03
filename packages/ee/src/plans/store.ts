// Copyright (c) Nubisco: All Rights Reserved.
// See packages/ee/LICENSE for terms. Enterprise Edition only.

/**
 * The local copy of each account's entitlement (the AccountPlan table).
 *
 * Plan resolution reads only this. It is kept fresh three ways: the signed
 * webhook pushes every change, a missing or day-old row is fetched on use,
 * and the billing page fetches when it opens. A newer version always wins and
 * an older one is ignored. A network error never drops an account to Free:
 * the row it had stays.
 */

import { plansConfig } from './config.js'
import {
  fetchEntitlement,
  type EntitlementSource,
  type EntitlementState,
  type LicensesEntitlement,
  type LicensesSubscription,
} from './client.js'

export const STALE_MS = 24 * 60 * 60 * 1000

/** One AccountPlan row as the database holds it. */
export interface AccountPlanDbRow {
  accountId: string
  plan: string
  state: string
  source: string
  limits: string
  subscription: string | null
  version: number
  graceUntil: Date | null
  endsAt: Date | null
  fetchedAt: Date
}

type AccountPlanData = Omit<AccountPlanDbRow, 'accountId'>

/**
 * The part of the API's Prisma client the plans module uses. EE describes the
 * shape instead of importing the generated client, which lives in apps/api.
 */
export interface PlansDb {
  account: {
    findUnique(args: { where: { id: string } }): Promise<{ id: string } | null>
  }
  accountPlan: {
    findUnique(args: { where: { accountId: string } }): Promise<AccountPlanDbRow | null>
    create(args: { data: AccountPlanDbRow }): Promise<unknown>
    updateMany(args: {
      where: { accountId: string; version?: { lt: number } }
      data: Partial<AccountPlanData>
    }): Promise<{ count: number }>
  }
}

/** The cached plan, parsed. */
export interface PlanRow {
  plan: string
  state: EntitlementState
  source: EntitlementSource
  limits: Record<string, number | null>
  subscription: LicensesSubscription | null
  version: number
  fetchedAt: Date
}

function parse(row: AccountPlanDbRow): PlanRow {
  return {
    plan: row.plan,
    state: row.state as EntitlementState,
    source: row.source as EntitlementSource,
    limits: JSON.parse(row.limits || '{}') as Record<string, number | null>,
    subscription: row.subscription ? (JSON.parse(row.subscription) as LicensesSubscription) : null,
    version: row.version,
    fetchedAt: row.fetchedAt,
  }
}

export async function cachedPlan(db: PlansDb, accountId: string): Promise<PlanRow | null> {
  const row = await db.accountPlan.findUnique({ where: { accountId } })
  return row ? parse(row) : null
}

export type ApplyOutcome = 'applied' | 'stale' | 'unknown_account'

function dateOrNull(iso: string | null | undefined): Date | null {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d
}

function dataOf(e: LicensesEntitlement, now: Date): AccountPlanData {
  return {
    plan: e.plan,
    state: e.state,
    source: e.source,
    limits: JSON.stringify(e.limits ?? {}),
    subscription: e.subscription ? JSON.stringify(e.subscription) : null,
    version: e.version,
    graceUntil: dateOrNull(e.subscription?.grace_until),
    endsAt: dateOrNull(e.subscription?.ends_at),
    fetchedAt: now,
  }
}

/**
 * Stores an entitlement unless the copy held is newer. An equal version only
 * refreshes fetchedAt, so a fetch still counts as fresh. The write itself is
 * conditional on the version, so two deliveries racing cannot let the older
 * one land last.
 */
export async function applyEntitlement(
  db: PlansDb,
  e: LicensesEntitlement,
  now: Date = new Date(),
): Promise<{ outcome: ApplyOutcome; before: PlanRow | null }> {
  const accountId = e.workspace_id
  const account = await db.account.findUnique({ where: { id: accountId } })
  if (!account) return { outcome: 'unknown_account', before: null }
  const before = await cachedPlan(db, accountId)
  if (before && e.version < before.version) return { outcome: 'stale', before }
  if (before && e.version === before.version) {
    await db.accountPlan.updateMany({ where: { accountId }, data: { fetchedAt: now } })
    return { outcome: 'stale', before }
  }
  const data = dataOf(e, now)
  if (before) {
    const { count } = await db.accountPlan.updateMany({ where: { accountId, version: { lt: e.version } }, data })
    return { outcome: count > 0 ? 'applied' : 'stale', before }
  }
  try {
    await db.accountPlan.create({ data: { accountId, ...data } })
    return { outcome: 'applied', before }
  } catch {
    // Another delivery created the row first: compare against it instead.
    const { count } = await db.accountPlan.updateMany({ where: { accountId, version: { lt: e.version } }, data })
    return { outcome: count > 0 ? 'applied' : 'stale', before }
  }
}

/**
 * The account's plan: the cached row, refreshed from licenses when missing,
 * day-old or `force`d. Null means Free (no row and licenses could not be
 * asked). Errors are swallowed on purpose: the copy held is kept.
 */
export async function planFor(
  db: PlansDb,
  accountId: string,
  opts: { force?: boolean; now?: Date } = {},
): Promise<PlanRow | null> {
  const cfg = plansConfig()
  const now = opts.now ?? new Date()
  const held = await cachedPlan(db, accountId)
  const fresh = held && now.getTime() - held.fetchedAt.getTime() < STALE_MS
  if (!cfg || (fresh && !opts.force)) return held
  try {
    const e = await fetchEntitlement(cfg, accountId)
    if (e.app !== 'verba' || e.workspace_id !== accountId) throw new Error('licenses answered for another workspace')
    await applyEntitlement(db, e, now)
    return await cachedPlan(db, accountId)
  } catch (err) {
    console.error(
      `plans: could not refresh the entitlement of account ${accountId}, keeping what is held:`,
      err instanceof Error ? err.message : err,
    )
    return held
  }
}
