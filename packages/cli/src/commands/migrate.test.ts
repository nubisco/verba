import { describe, it, expect, vi } from 'vitest'
import { resolve } from 'node:path'
import { databaseUrlFromEnvFile, dbPushCommand, runMigrate, type MigrateDeps } from './migrate.js'

class Exit extends Error {
  constructor(readonly code: number) {
    super(`exit ${code}`)
  }
}

function deps(overrides: Partial<MigrateDeps> = {}) {
  const logs: string[] = []
  const errors: string[] = []
  const d: MigrateDeps = {
    root: () => '/repo',
    exists: () => true,
    readFile: () => 'DATABASE_URL="file:./dev.db"\nJWT_SECRET="x"\n',
    exec: vi.fn(),
    log: (m) => logs.push(m),
    error: (m) => errors.push(m),
    exit: (code) => {
      throw new Exit(code)
    },
    ...overrides,
  }
  return { d, logs, errors }
}

describe('dbPushCommand', () => {
  it('runs prisma db push for SQLite', () => {
    expect(dbPushCommand()).toBe('npx prisma db push')
  })

  it('accepts data loss only when asked to', () => {
    expect(dbPushCommand({ acceptDataLoss: false })).toBe('npx prisma db push')
    expect(dbPushCommand({ acceptDataLoss: true })).toBe('npx prisma db push --accept-data-loss')
  })
})

describe('verba migrate', () => {
  it('pushes the schema from apps/api without --accept-data-loss by default', async () => {
    const { d, logs } = deps()
    await runMigrate({}, d)
    expect(d.exec).toHaveBeenCalledOnce()
    expect(d.exec).toHaveBeenCalledWith('npx prisma db push', resolve('/repo', 'apps/api'))
    expect(logs.join('\n')).toMatch(/prisma db push/)
    expect(logs.join('\n')).toMatch(/would lose data stop here/)
  })

  it('passes --accept-data-loss through and warns that it drops data', async () => {
    const { d, logs } = deps()
    await runMigrate({ acceptDataLoss: true }, d)
    expect(d.exec).toHaveBeenCalledWith('npx prisma db push --accept-data-loss', resolve('/repo', 'apps/api'))
    expect(logs.join('\n')).toMatch(/--accept-data-loss: changes that drop columns, tables or their data/)
  })

  it('stops before touching the database when apps/api/.env is missing', async () => {
    const { d, errors } = deps({ exists: () => false })
    await expect(runMigrate({}, d)).rejects.toMatchObject({ code: 1 })
    expect(d.exec).not.toHaveBeenCalled()
    expect(errors.join('\n')).toMatch(/verba setup/)
  })

  it('exits non-zero when prisma db push fails', async () => {
    const { d, errors } = deps({
      exec: vi.fn(() => {
        throw new Error('Use the --accept-data-loss flag to ignore the data loss warnings')
      }),
    })
    await expect(runMigrate({}, d)).rejects.toMatchObject({ code: 1 })
    expect(errors.join('\n')).toMatch(/prisma db push failed/)
  })

  it('applies the migration history with migrate deploy on PostgreSQL, never db push', async () => {
    const { d, logs } = deps({ readFile: () => 'DATABASE_URL="postgresql://verba:pw@db:5432/verba"\n' })
    await runMigrate({ acceptDataLoss: true }, d)
    expect(d.exec).toHaveBeenCalledOnce()
    expect(d.exec).toHaveBeenCalledWith('node scripts/migrations.mjs deploy', resolve('/repo', 'apps/api'))
    expect(logs.join('\n')).toMatch(/prisma migrate deploy/)
    expect(logs.join('\n')).not.toMatch(/db push/)
  })

  it('reads DATABASE_URL from the .env the wizard writes', () => {
    expect(databaseUrlFromEnvFile('PORT=4000\nDATABASE_URL="postgres://a@b/c"\n')).toBe('postgres://a@b/c')
    expect(databaseUrlFromEnvFile("DATABASE_URL='file:./dev.db'")).toBe('file:./dev.db')
    expect(databaseUrlFromEnvFile('PORT=4000')).toBeUndefined()
  })

  it('exits non-zero outside a Verba checkout', async () => {
    const { d } = deps({
      root: () => {
        throw new Error('Could not find Verba project root.')
      },
    })
    await expect(runMigrate({}, d)).rejects.toMatchObject({ code: 1 })
    expect(d.exec).not.toHaveBeenCalled()
  })
})
