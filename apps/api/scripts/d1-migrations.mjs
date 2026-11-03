#!/usr/bin/env node
// D1 migration history for hosted Verba on Cloudflare (docs/hosting-on-cloudflare.md).
//
// The Worker's database is D1, which is SQLite. Its history is
// prisma/d1/NNNN_name.sql, the format `wrangler d1 migrations apply` reads,
// generated from the same prisma/schema.prisma as the PostgreSQL history in
// prisma/migrations (scripts/migrations.mjs). Every schema change writes both.
//
//   node scripts/d1-migrations.mjs new <name>   write the next D1 migration
//   node scripts/d1-migrations.mjs check        fail if the history and schema differ
//
// Both replay the history into a scratch SQLite file with node:sqlite and ask
// Prisma for the difference to the schema. Nothing touches D1 itself.

import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'

const apiDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const historyDir = join(apiDir, 'prisma', 'd1')
const prismaBin = join(apiDir, 'node_modules', '.bin', 'prisma')

function history() {
  return readdirSync(historyDir)
    .filter((f) => /^\d{4}_[a-z0-9_]+\.sql$/.test(f))
    .sort()
}

/** The history applied to a fresh SQLite file. */
function replay() {
  const dir = mkdtempSync(join(tmpdir(), 'verba-d1-'))
  const file = join(dir, 'replay.db')
  const db = new DatabaseSync(file)
  for (const name of history()) db.exec(readFileSync(join(historyDir, name), 'utf8'))
  db.close()
  return { file, cleanup: () => rmSync(dir, { recursive: true, force: true }) }
}

function diff(dbFile, extra) {
  return execFileSync(
    prismaBin,
    ['migrate', 'diff', '--from-config-datasource', '--to-schema', 'prisma/schema.prisma', ...extra],
    {
      cwd: apiDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'inherit'],
      env: { ...process.env, DATABASE_URL: `file:${dbFile}` },
    },
  )
}

function run(command, name) {
  if (command === 'new') {
    if (!name || !/^[a-z0-9_]+$/.test(name)) {
      console.error('Usage: node scripts/d1-migrations.mjs new <snake_case_name>')
      return 1
    }
    const db = replay()
    try {
      const sql = diff(db.file, ['--script'])
      if (!/^\s*(CREATE|ALTER|DROP|PRAGMA|INSERT)/m.test(sql)) {
        console.log('The D1 history already matches the schema. Nothing to write.')
        return 0
      }
      const next = String(history().length + 1).padStart(4, '0')
      const file = join(historyDir, `${next}_${name}.sql`)
      writeFileSync(file, sql)
      console.log(`Wrote ${file}. Read it before committing: wrangler applies it to hosted Verba's D1.`)
      return 0
    } finally {
      db.cleanup()
    }
  }
  if (command === 'check') {
    const db = replay()
    try {
      // --exit-code: 0 when there is no difference, 2 when there is one.
      diff(db.file, ['--exit-code'])
    } catch (err) {
      if (err.status !== 2) throw err
      console.error(
        'prisma/schema.prisma has changes with no D1 migration. Run: node scripts/d1-migrations.mjs new <name>',
      )
      return 1
    } finally {
      db.cleanup()
    }
    console.log('D1 migration history matches prisma/schema.prisma.')
    return 0
  }
  console.error('Usage: node scripts/d1-migrations.mjs <new <name> | check>')
  return 1
}

const [command, name] = process.argv.slice(2)
process.exitCode = run(command, name)
