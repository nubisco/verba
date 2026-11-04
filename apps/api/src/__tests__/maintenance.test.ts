import { beforeEach, describe, expect, it, vi } from 'vitest'

// The hourly housekeeping (maintenance.service.ts) and the slimmer audit rows
// (audit.service.ts), from the 2026-10-24 port plan.

vi.mock('../prisma.js', () => ({
  prisma: {
    auditLog: { deleteMany: vi.fn() },
    otpToken: { deleteMany: vi.fn() },
    importChunk: { deleteMany: vi.fn() },
    importRun: { updateMany: vi.fn() },
    instanceAuditLog: { findFirst: vi.fn(), create: vi.fn() },
  },
}))
const hosted = vi.fn()
vi.mock('../services/billing.service.js', () => ({ hostedBillingEnabled: () => hosted() }))
const sendEmail = vi.fn()
vi.mock('../services/email.service.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/email.service.js')>()),
  sendEmail: (...args: unknown[]) => sendEmail(...args),
}))

import { prisma } from '../prisma.js'
import { changedFields } from '../services/audit.service.js'
import { STORAGE_ALERT_BYTES, maintenanceTick, pruneAuditLogs, storageAlert } from '../services/maintenance.service.js'

const NOW = new Date('2026-11-03T12:00:00Z')
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 3600 * 1000)

beforeEach(() => {
  vi.clearAllMocks()
  for (const fn of [prisma.auditLog.deleteMany, prisma.otpToken.deleteMany, prisma.importChunk.deleteMany]) {
    vi.mocked(fn).mockResolvedValue({ count: 0 })
  }
  vi.mocked(prisma.importRun.updateMany).mockResolvedValue({ count: 0 })
})

describe('audit retention', () => {
  it('keeps 30 days for Free accounts and a year for the rest on hosted plans', async () => {
    hosted.mockResolvedValue(true)
    await pruneAuditLogs(NOW, {})
    const [free, paid] = vi.mocked(prisma.auditLog.deleteMany).mock.calls.map((c) => c[0]!.where!)
    expect(free).toMatchObject({ createdAt: { lt: daysAgo(30) } })
    expect(JSON.stringify(free)).toContain('"plan":"free"')
    expect(paid).toEqual({ createdAt: { lt: daysAgo(365) } })
  })

  it('keeps everything on a self-hosted instance unless AUDIT_RETENTION_DAYS says otherwise', async () => {
    hosted.mockResolvedValue(false)
    await pruneAuditLogs(NOW, {})
    expect(prisma.auditLog.deleteMany).not.toHaveBeenCalled()
    await pruneAuditLogs(NOW, { AUDIT_RETENTION_DAYS: '90' })
    expect(prisma.auditLog.deleteMany).toHaveBeenCalledWith({ where: { createdAt: { lt: daysAgo(90) } } })
  })
})

describe('the storage alert', () => {
  it('says nothing under 5 GB', async () => {
    expect(await storageAlert(STORAGE_ALERT_BYTES - 1, NOW, {})).toBe(false)
    expect(prisma.instanceAuditLog.create).not.toHaveBeenCalled()
  })

  it('tells the operators once a day past 5 GB', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.mocked(prisma.instanceAuditLog.findFirst)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'a' } as never)
    const env = { VERBA_OPERATORS: 'op@example.com' }
    expect(await storageAlert(STORAGE_ALERT_BYTES + 1, NOW, env)).toBe(true)
    expect(await storageAlert(STORAGE_ALERT_BYTES + 2, NOW, env)).toBe(false)
    expect(sendEmail).toHaveBeenCalledTimes(1)
    expect(sendEmail.mock.calls[0][0]).toMatchObject({ to: ['op@example.com'] })
  })
})

describe('maintenanceTick', () => {
  it('runs every step, and one failing does not stop the others', async () => {
    hosted.mockResolvedValue(false)
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(prisma.otpToken.deleteMany).mockRejectedValue(new Error('down'))
    vi.mocked(prisma.importChunk.deleteMany).mockResolvedValue({ count: 7 })
    vi.mocked(prisma.importRun.updateMany).mockResolvedValue({ count: 1 })
    const report = await maintenanceTick({ now: NOW, env: {}, sizeBytes: async () => 1024 })
    expect(report).toEqual({
      auditDeleted: 0,
      otpDeleted: 0,
      chunksDeleted: 7,
      runsFailed: 1,
      sizeBytes: 1024,
      alerted: false,
    })
  })
})

describe('audit rows keep only what changed', () => {
  it('drops the fields equal on both sides', () => {
    expect(changedFields({ name: 'a', description: 'same', n: 1 }, { name: 'b', description: 'same', n: 1 })).toEqual({
      before: { name: 'a' },
      after: { name: 'b' },
    })
  })

  it('keeps a creation or a deletion whole', () => {
    expect(changedFields(undefined, { name: 'a' })).toEqual({ before: undefined, after: { name: 'a' } })
  })
})
