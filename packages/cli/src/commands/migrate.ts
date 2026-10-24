import { execSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import chalk from 'chalk'

const __dirname = dirname(fileURLToPath(import.meta.url))

function findRoot(): string {
  let dir = resolve(__dirname, '../../..')
  while (dir !== '/') {
    if (existsSync(resolve(dir, 'apps/api'))) return dir
    dir = resolve(dir, '..')
  }
  throw new Error('Could not find Verba project root.')
}

export interface MigrateOptions {
  /** Let `prisma db push` apply changes that drop columns, tables or data. */
  acceptDataLoss?: boolean
}

/**
 * The command that brings a SQLite database in line with the schema.
 *
 * SQLite is for development and single-server trials, and has no migration
 * history: `prisma db push` applies the schema directly. Without
 * `acceptDataLoss`, Prisma refuses (or, in a terminal, asks before) any change
 * that would lose data.
 */
export function dbPushCommand(options: MigrateOptions = {}): string {
  return options.acceptDataLoss ? 'npx prisma db push --accept-data-loss' : 'npx prisma db push'
}

/**
 * PostgreSQL applies the reviewed migration history in apps/api/prisma/migrations
 * with `prisma migrate deploy`, as the Docker image does on start. It never
 * drops data on its own, so there is no data-loss switch.
 */
export const MIGRATE_DEPLOY_COMMAND = 'node scripts/migrations.mjs deploy'

export function isPostgresUrl(url: string | undefined): boolean {
  return !!url && /^postgres(ql)?:\/\//.test(url)
}

/** DATABASE_URL as written to apps/api/.env by `verba setup`. */
export function databaseUrlFromEnvFile(contents: string): string | undefined {
  const line = contents.split(/\r?\n/).find((l) => /^\s*DATABASE_URL\s*=/.test(l))
  if (!line) return undefined
  return line
    .slice(line.indexOf('=') + 1)
    .trim()
    .replace(/^["']|["']$/g, '')
}

export interface MigrateDeps {
  root: () => string
  exists: (path: string) => boolean
  readFile: (path: string) => string
  exec: (command: string, cwd: string) => void
  log: (message: string) => void
  error: (message: string) => void
  exit: (code: number) => never
}

const defaultDeps: MigrateDeps = {
  root: findRoot,
  exists: existsSync,
  readFile: (path) => readFileSync(path, 'utf8'),
  exec: (command, cwd) => {
    // Inherit the terminal so Prisma's data-loss warnings and its confirmation
    // prompt reach the person running the command.
    execSync(command, { cwd, stdio: 'inherit' })
  },
  log: (message) => console.log(message),
  error: (message) => console.error(message),
  exit: (code) => process.exit(code),
}

/**
 * Apply the schema to the database configured in apps/api/.env.
 *
 * Shared by `verba migrate` and the setup wizard. Throws when Prisma fails,
 * so each caller decides how to report it.
 */
export function pushSchema(
  apiDir: string,
  options: MigrateOptions,
  deps: Pick<MigrateDeps, 'exec' | 'log'>,
  databaseUrl?: string,
): void {
  if (isPostgresUrl(databaseUrl)) {
    deps.log(chalk.bold('Applying pending migrations from apps/api/prisma/migrations (prisma migrate deploy).'))
    deps.exec(MIGRATE_DEPLOY_COMMAND, apiDir)
    return
  }
  deps.log(chalk.bold('Applying apps/api/prisma/schema.prisma to the database (prisma db push).'))
  if (options.acceptDataLoss) {
    deps.log(
      chalk.yellow(
        '--accept-data-loss: changes that drop columns, tables or their data are applied without asking. ' +
          'Back up the database first.',
      ),
    )
  } else {
    deps.log(
      chalk.dim(
        'Changes that would lose data stop here. Back up the database, then rerun with --accept-data-loss ' +
          'to apply them.',
      ),
    )
  }
  deps.exec(dbPushCommand(options), apiDir)
}

export async function runMigrate(options: MigrateOptions = {}, deps: MigrateDeps = defaultDeps): Promise<void> {
  let root: string
  try {
    root = deps.root()
  } catch (e) {
    deps.error(chalk.red((e as Error).message))
    return deps.exit(1)
  }

  const apiDir = resolve(root, 'apps/api')
  const envPath = resolve(apiDir, '.env')

  if (!deps.exists(envPath)) {
    deps.error(chalk.red('No .env found in apps/api/. Run `verba setup` first.'))
    return deps.exit(1)
  }

  const databaseUrl = databaseUrlFromEnvFile(deps.readFile(envPath))
  try {
    pushSchema(apiDir, options, deps, databaseUrl)
    deps.log(chalk.green('Database schema is up to date.'))
  } catch (err) {
    deps.error(chalk.red(isPostgresUrl(databaseUrl) ? 'prisma migrate deploy failed.' : 'prisma db push failed.'))
    deps.error(chalk.red((err as Error).message))
    return deps.exit(1)
  }
}
