// The hourly housekeeping: on a Worker its cron trigger runs it, on Node a
// timer in index.ts. Each step logs its own failure and the next one runs.
//
// - Audit retention. Hosted Verba keeps a Free account's audit log for 30
//   days and a paid one's for a year, as the plans promise. A self-hosted
//   instance keeps everything unless AUDIT_RETENTION_DAYS says otherwise.
// - Expired one-time codes, and the chunks of finished background runs.
// - Runs stuck for a day (a job lost after its retries) are closed as FAILED.
// - The database size: hosted Verba keeps every account in one D1 database,
//   capped at 10 GB, so at 5 GB the operators are told, once a day, while
//   there is time to move the largest accounts out
//   (docs/hosting-on-cloudflare.md).

import { prisma } from '../prisma.js'
import { hostedBillingEnabled } from './billing.service.js'
import { escapeHtml, sendEmail } from './email.service.js'
import { operatorEmails } from './operator.service.js'

const DAY_MS = 24 * 3600 * 1000

/** Audit retention on hosted plans, in days. */
export const HOSTED_AUDIT_RETENTION_DAYS = { free: 30, paid: 365 } as const

/** Above this the operators are told the database is filling up. */
export const STORAGE_ALERT_BYTES = 5 * 1024 ** 3

export interface MaintenanceOptions {
  now?: Date
  /** The database size in bytes, where it can be told (D1). */
  sizeBytes?: () => Promise<number | null>
  env?: Record<string, string | undefined>
}

export interface MaintenanceReport {
  auditDeleted: number
  otpDeleted: number
  chunksDeleted: number
  runsFailed: number
  sizeBytes: number | null
  alerted: boolean
}

/**
 * Delete project audit entries past their retention. Returns how many. The
 * instance audit record (InstanceAuditLog) is never pruned: it holds operator
 * changes and every terms acceptance (`terms.accepted`), which must outlive it.
 */
export async function pruneAuditLogs(now: Date, env = process.env): Promise<number> {
  if (await hostedBillingEnabled()) {
    const free = await prisma.auditLog.deleteMany({
      where: {
        createdAt: { lt: new Date(now.getTime() - HOSTED_AUDIT_RETENTION_DAYS.free * DAY_MS) },
        project: { account: { OR: [{ plan: { is: null } }, { plan: { is: { plan: 'free' } } }] } },
      },
    })
    const paid = await prisma.auditLog.deleteMany({
      where: { createdAt: { lt: new Date(now.getTime() - HOSTED_AUDIT_RETENTION_DAYS.paid * DAY_MS) } },
    })
    return free.count + paid.count
  }
  const days = Number(env.AUDIT_RETENTION_DAYS)
  if (!Number.isFinite(days) || days <= 0) return 0
  const kept = await prisma.auditLog.deleteMany({
    where: { createdAt: { lt: new Date(now.getTime() - days * DAY_MS) } },
  })
  return kept.count
}

/** Codes expired for a day are no use to anyone. */
export async function pruneOtpTokens(now: Date): Promise<number> {
  const deleted = await prisma.otpToken.deleteMany({ where: { expiresAt: { lt: new Date(now.getTime() - DAY_MS) } } })
  return deleted.count
}

/** The chunks of runs finished a day ago: their totals are on the run. */
export async function pruneJobChunks(now: Date): Promise<number> {
  const deleted = await prisma.importChunk.deleteMany({
    where: { run: { status: { in: ['COMPLETED', 'FAILED'] }, updatedAt: { lt: new Date(now.getTime() - DAY_MS) } } },
  })
  return deleted.count
}

/** A run with no progress for a day lost a job for good. Close it so the page says so. */
export async function failStuckRuns(now: Date): Promise<number> {
  const failed = await prisma.importRun.updateMany({
    where: { status: 'RUNNING', updatedAt: { lt: new Date(now.getTime() - DAY_MS) } },
    data: { status: 'FAILED', errors: JSON.stringify([{ row: 0, message: 'The import stopped before it finished.' }]) },
  })
  return failed.count
}

/** Tell the operators when the database passes STORAGE_ALERT_BYTES, at most once a day. */
export async function storageAlert(
  sizeBytes: number | null,
  now: Date,
  env: Record<string, string | undefined> = process.env,
): Promise<boolean> {
  if (sizeBytes === null || sizeBytes < STORAGE_ALERT_BYTES) return false
  const recent = await prisma.instanceAuditLog.findFirst({
    where: { action: 'storage.alert', createdAt: { gt: new Date(now.getTime() - DAY_MS) } },
    select: { id: true },
  })
  if (recent) return false
  const gb = (sizeBytes / 1024 ** 3).toFixed(2)
  console.warn(`[maintenance] the database holds ${gb} GB, past the ${STORAGE_ALERT_BYTES / 1024 ** 3} GB alert`)
  await prisma.instanceAuditLog.create({ data: { action: 'storage.alert', detail: JSON.stringify({ sizeBytes }) } })
  const to = [...operatorEmails(env.VERBA_OPERATORS)]
  if (to.length > 0) {
    const text = `Verba's database holds ${gb} GB. D1 stops at 10 GB, so plan moving the largest accounts to a database of their own (docs/hosting-on-cloudflare.md).`
    await sendEmail({ to, subject: `Verba's database holds ${gb} GB`, text, html: `<p>${escapeHtml(text)}</p>` }, env)
  }
  return true
}

async function step<T>(name: string, fallback: T, work: () => Promise<T>): Promise<T> {
  try {
    return await work()
  } catch (err) {
    console.error(`[maintenance] ${name} failed:`, err)
    return fallback
  }
}

export async function maintenanceTick(options: MaintenanceOptions = {}): Promise<MaintenanceReport> {
  const now = options.now ?? new Date()
  const env = options.env ?? process.env
  const auditDeleted = await step('audit retention', 0, () => pruneAuditLogs(now, env))
  const otpDeleted = await step('one-time codes', 0, () => pruneOtpTokens(now))
  const chunksDeleted = await step('job chunks', 0, () => pruneJobChunks(now))
  const runsFailed = await step('stuck runs', 0, () => failStuckRuns(now))
  const sizeBytes = options.sizeBytes ? await step('database size', null, options.sizeBytes) : null
  const alerted = await step('storage alert', false, () => storageAlert(sizeBytes, now, env))
  return { auditDeleted, otpDeleted, chunksDeleted, runsFailed, sizeBytes, alerted }
}
