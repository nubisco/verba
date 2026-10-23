import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
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
 * The command that brings the database in line with the schema.
 *
 * Verba's supported path is `prisma db push`, the same command the Docker
 * image runs on every start. The migration files in apps/api/prisma/migrations
 * are SQLite-only history and cannot be applied to PostgreSQL, so
 * `prisma migrate deploy` is not used.
 *
 * Without `acceptDataLoss`, Prisma refuses (or, in a terminal, asks before)
 * any change that would lose data. The Docker image always passes
 * `--accept-data-loss`. Here it has to be asked for.
 */
export function dbPushCommand(options: MigrateOptions = {}): string {
  return options.acceptDataLoss ? 'npx prisma db push --accept-data-loss' : 'npx prisma db push'
}

export interface MigrateDeps {
  root: () => string
  exists: (path: string) => boolean
  exec: (command: string, cwd: string) => void
  log: (message: string) => void
  error: (message: string) => void
  exit: (code: number) => never
}

const defaultDeps: MigrateDeps = {
  root: findRoot,
  exists: existsSync,
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
export function pushSchema(apiDir: string, options: MigrateOptions, deps: Pick<MigrateDeps, 'exec' | 'log'>): void {
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
          'to apply them (the Docker image always does).',
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

  try {
    pushSchema(apiDir, options, deps)
    deps.log(chalk.green('Database schema is up to date.'))
  } catch (err) {
    deps.error(chalk.red('prisma db push failed.'))
    deps.error(chalk.red((err as Error).message))
    return deps.exit(1)
  }
}
