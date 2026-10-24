#!/usr/bin/env node
// PostgreSQL migration history for production.
//
// The schema in prisma/schema.prisma says `sqlite` so that local development
// needs no database server, and the Docker build switches it to `postgresql`.
// The migrations in prisma/migrations are PostgreSQL SQL, applied by
// `prisma migrate deploy` when the API container starts. This script keeps the
// two in step without anyone hand-writing SQL.
//
//   node scripts/migrations.mjs deploy       apply pending migrations to DATABASE_URL
//   node scripts/migrations.mjs new <name>   write the next migration
//   node scripts/migrations.mjs check        fail if the history and schema differ
//
// `deploy` is what `verba migrate` runs for a PostgreSQL install from source
// (the Docker image runs `prisma migrate deploy` directly, its schema is
// already switched). `new` and `check` need SHADOW_DATABASE_URL: a scratch PostgreSQL that Prisma may wipe,
// into which it replays the history to compare it with the schema. Never point
// it at a database you care about. One way to get one:
//
//   docker run -d --rm --name verba-shadow -e POSTGRES_PASSWORD=shadow -p 55432:5432 postgres:16-alpine
//   export SHADOW_DATABASE_URL=postgresql://postgres:shadow@localhost:55432/postgres

import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const apiDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const migrationsDir = join(apiDir, 'prisma', 'migrations')
const prismaBin = join(apiDir, 'node_modules', '.bin', 'prisma')

function postgresSchema() {
  const source = readFileSync(join(apiDir, 'prisma', 'schema.prisma'), 'utf8')
  const switched = source.replace('provider = "sqlite"', 'provider = "postgresql"')
  if (switched === source) throw new Error('schema.prisma no longer declares provider = "sqlite"; update this script')
  const dir = mkdtempSync(join(tmpdir(), 'verba-schema-'))
  const file = join(dir, 'schema.prisma')
  writeFileSync(file, switched)
  return { file, cleanup: () => rmSync(dir, { recursive: true, force: true }) }
}

function diff(schemaFile, extra) {
  return execFileSync(
    prismaBin,
    ['migrate', 'diff', '--from-migrations', migrationsDir, '--to-schema', schemaFile, ...extra],
    { cwd: apiDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] },
  )
}

function timestamp() {
  return new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)
}

function run(command, name, schemaFile) {
  if (command === 'deploy') {
    execFileSync(prismaBin, ['migrate', 'deploy', '--schema', schemaFile], { cwd: apiDir, stdio: 'inherit' })
    return 0
  }
  if (command === 'new') {
    if (!name || !/^[a-z0-9_]+$/.test(name)) {
      console.error('Usage: node scripts/migrations.mjs new <snake_case_name>')
      return 1
    }
    const sql = diff(schemaFile, ['--script'])
    if (!/^\s*(CREATE|ALTER|DROP)/m.test(sql)) {
      console.log('The migration history already matches the schema. Nothing to write.')
      return 0
    }
    const dir = join(migrationsDir, `${timestamp()}_${name}`)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'migration.sql'), sql)
    console.log(`Wrote ${dir}/migration.sql. Read it before committing: it runs unattended in production.`)
    return 0
  }
  if (command === 'check') {
    // --exit-code: 0 when there is no difference, 2 when there is one.
    try {
      diff(schemaFile, ['--exit-code'])
    } catch (err) {
      if (err.status !== 2) throw err
      console.error('prisma/schema.prisma has changes with no migration. Run: node scripts/migrations.mjs new <name>')
      return 1
    }
    console.log('Migration history matches prisma/schema.prisma.')
    return 0
  }
  console.error('Usage: node scripts/migrations.mjs <deploy | new <name> | check>')
  return 1
}

const [command, name] = process.argv.slice(2)
if ((command === 'new' || command === 'check') && !process.env.SHADOW_DATABASE_URL) {
  console.error('SHADOW_DATABASE_URL is not set. See the comment at the top of this script.')
  process.exit(1)
}

const schema = postgresSchema()
try {
  process.exitCode = run(command, name, schema.file)
} finally {
  schema.cleanup()
}
