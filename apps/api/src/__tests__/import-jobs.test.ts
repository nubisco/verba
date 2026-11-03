import { beforeEach, describe, expect, it, vi } from 'vitest'

// Imports and AI fills as chunked background jobs (import-job.service.ts,
// jobs.ts). What matters on D1 is that a chunk's queries stay few and every
// statement stays under 100 bound parameters, so the tests count both. The
// end-to-end proof, a 20,000-row import and an AI fill on a local Worker, is in
// docs/hosting-on-cloudflare.md.

vi.mock('../prisma.js', () => ({
  prisma: {
    locale: { findMany: vi.fn() },
    namespace: { findMany: vi.fn(), upsert: vi.fn() },
    key: { findMany: vi.fn(), createManyAndReturn: vi.fn(), update: vi.fn() },
    translation: { findMany: vi.fn(), createMany: vi.fn(), update: vi.fn() },
    auditLog: { createMany: vi.fn() },
    importRun: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    importChunk: { createMany: vi.fn(), findMany: vi.fn(), update: vi.fn(), count: vi.fn() },
  },
}))
vi.mock('../services/analytics.service.js', () => ({ track: vi.fn() }))
vi.mock('../live.js', () => ({ live: () => ({ broadcast: vi.fn(), notifyUser: vi.fn() }) }))

import { prisma } from '../prisma.js'
import { enqueue, inProcessQueue, setJobQueue, setJobRunner, type Job } from '../jobs.js'
import {
  CELLS_PER_CHUNK,
  IN_GROUP,
  chunkRows,
  closeRun,
  startRun,
  writeImportRows,
  type JobRow,
} from '../services/import-job.service.js'

function rowsOf(n: number, locales = ['en', 'pt']): JobRow[] {
  return Array.from({ length: n }, (_, i) => ({
    row: i + 2,
    nsSlug: 'app',
    nsName: 'app',
    key: `k${i}`,
    cells: locales.map((locale) => ({ locale, text: `${locale} ${i}` })),
  }))
}

/** Every Prisma call made, and the largest list of values any one of them sent. */
function calls() {
  let total = 0
  for (const model of Object.values(prisma) as Record<string, { mock?: { calls: unknown[] } }>[]) {
    for (const fn of Object.values(model)) total += fn.mock?.calls.length ?? 0
  }
  return total
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(prisma.locale.findMany).mockResolvedValue([
    { id: 'l-en', code: 'en' },
    { id: 'l-pt', code: 'pt' },
  ] as never)
  vi.mocked(prisma.namespace.findMany).mockResolvedValue([{ id: 'ns1', slug: 'app' }] as never)
  vi.mocked(prisma.key.findMany).mockResolvedValue([])
  vi.mocked(prisma.key.createManyAndReturn).mockImplementation((async (args: {
    data: { name: string; namespaceId: string }[]
  }) =>
    args.data.map((k) => ({
      id: `id-${k.name}`,
      name: k.name,
      namespaceId: k.namespaceId,
      description: null,
    }))) as never)
  vi.mocked(prisma.translation.findMany).mockResolvedValue([])
})

describe('chunkRows', () => {
  it('keeps every chunk under the cell budget and never splits a row', () => {
    const chunks = chunkRows(rowsOf(1000, ['en', 'pt', 'fr']))
    expect(chunks.every((c) => c.reduce((n, r) => n + r.cells.length, 0) <= CELLS_PER_CHUNK)).toBe(true)
    expect(chunks.flat()).toHaveLength(1000)
  })
})

describe('writeImportRows', () => {
  it('writes a fresh chunk set-based: a few dozen statements for 200 rows in two locales', async () => {
    const result = await writeImportRows('p1', rowsOf(200), 'u1')
    expect(result.stats).toEqual({ created: 200, updated: 0, skipped: 0 })
    expect(result.errors).toEqual([])
    // 200 keys in batches of 15, 400 translations in batches of 10.
    expect(prisma.key.createManyAndReturn).toHaveBeenCalledTimes(14)
    expect(prisma.translation.createMany).toHaveBeenCalledTimes(40)
    expect(calls()).toBeLessThan(80)
  })

  it('never puts more than 100 values in one statement', async () => {
    await writeImportRows('p1', rowsOf(200), 'u1')
    for (const call of vi.mocked(prisma.key.findMany).mock.calls) {
      expect((call[0] as { where: { name: { in: string[] } } }).where.name.in.length).toBeLessThanOrEqual(IN_GROUP)
    }
    for (const call of vi.mocked(prisma.translation.createMany).mock.calls) {
      // Eight columns at most per translation.
      expect((call[0] as { data: unknown[] }).data.length * 8).toBeLessThanOrEqual(100)
    }
  })

  it('updates only changed text, audits it, and leaves equal text alone', async () => {
    vi.mocked(prisma.key.findMany).mockResolvedValue([
      { id: 'k0', name: 'k0', namespaceId: 'ns1', description: null },
    ] as never)
    vi.mocked(prisma.translation.findMany).mockResolvedValue([
      { id: 't-en', keyId: 'k0', localeId: 'l-en', text: 'en 0', status: 'APPROVED', version: 3, assignedToId: null },
      { id: 't-pt', keyId: 'k0', localeId: 'l-pt', text: 'old', status: 'APPROVED', version: 2, assignedToId: 'u9' },
    ] as never)
    const result = await writeImportRows('p1', rowsOf(1), 'u1')
    expect(result.stats).toEqual({ created: 0, updated: 1, skipped: 0 })
    expect(prisma.translation.update).toHaveBeenCalledTimes(1)
    // A maintainer's import keeps the approval, as a save by a maintainer does.
    expect(prisma.translation.update).toHaveBeenCalledWith({
      where: { id: 't-pt' },
      data: { text: 'pt 0', status: 'APPROVED', version: 3, updatedById: 'u1' },
    })
    const audit = vi.mocked(prisma.auditLog.createMany).mock.calls[0][0] as {
      data: { before: string; after: string }[]
    }
    expect(audit.data).toEqual([
      expect.objectContaining({ entityId: 't-pt', before: '{"text":"old"}', after: '{"text":"pt 0"}' }),
    ])
  })

  it('reports a locale the project does not have, with the file row', async () => {
    const result = await writeImportRows('p1', rowsOf(1, ['en', 'xx']), 'u1')
    expect(result.errors).toEqual([{ row: 2, message: 'Locale "xx" not found in project' }])
  })

  it('takes the status an XLIFF file gives', async () => {
    const rows: JobRow[] = [
      { row: 0, nsSlug: 'app', nsName: 'app', key: 'a', cells: [{ locale: 'en', text: 'Hi', status: 'APPROVED' }] },
    ]
    await writeImportRows('p1', rows, 'u1')
    expect(vi.mocked(prisma.translation.createMany).mock.calls[0][0]).toEqual({
      data: [{ keyId: 'id-a', localeId: 'l-en', text: 'Hi', status: 'APPROVED', updatedById: 'u1' }],
    })
  })
})

describe('startRun', () => {
  it('stores the chunks and enqueues one job each', async () => {
    vi.mocked(prisma.importRun.create).mockResolvedValue({ id: 'run1', status: 'RUNNING' } as never)
    vi.mocked(prisma.importChunk.findMany).mockResolvedValue([{ id: 'c1' }, { id: 'c2' }] as never)
    const sent: Job[] = []
    setJobQueue({ send: async (jobs) => void sent.push(...jobs) })
    const run = await startRun({
      projectId: 'p1',
      userId: 'u1',
      kind: 'import',
      meta: {},
      chunks: [[1], [2]],
      totalRows: 2,
    })
    expect(run).toEqual({ importRunId: 'run1', status: 'RUNNING', totalRows: 2 })
    expect(sent).toEqual([
      { kind: 'import.chunk', chunkId: 'c1' },
      { kind: 'import.chunk', chunkId: 'c2' },
    ])
  })
})

describe('closeRun', () => {
  it('sums the chunks once, and a second closer changes nothing', async () => {
    vi.mocked(prisma.importChunk.findMany).mockResolvedValue([
      { status: 'DONE', stats: '{"created":3,"updated":1}', errors: '[]' },
      { status: 'DONE', stats: '{"created":2,"updated":0}', errors: '[{"row":9,"message":"x"}]' },
    ] as never)
    vi.mocked(prisma.importRun.findUnique).mockResolvedValue({
      id: 'run1',
      projectId: 'p1',
      userId: 'u1',
      kind: 'import',
      status: 'RUNNING',
      stats: '{"skipped":4}',
      mapping: '{}',
    } as never)
    vi.mocked(prisma.importRun.updateMany).mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 })
    await closeRun('run1')
    expect(prisma.importRun.updateMany).toHaveBeenCalledWith({
      where: { id: 'run1', status: 'RUNNING' },
      data: {
        status: 'COMPLETED',
        stats: '{"skipped":4,"created":5,"updated":1}',
        errors: '[{"row":9,"message":"x"}]',
      },
    })
  })
})

describe('the in-process queue', () => {
  it('runs jobs in order after the request, and a failure does not stop the next', async () => {
    const ran: string[] = []
    setJobRunner(async (job) => {
      if (job.chunkId === 'bad') throw new Error('boom')
      ran.push(job.chunkId)
    })
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const queue = inProcessQueue()
    setJobQueue(queue)
    await enqueue([
      { kind: 'import.chunk', chunkId: 'a' },
      { kind: 'import.chunk', chunkId: 'bad' },
      { kind: 'import.chunk', chunkId: 'b' },
    ])
    expect(ran).toEqual([])
    await queue.idle()
    expect(ran).toEqual(['a', 'b'])
    error.mockRestore()
  })
})
