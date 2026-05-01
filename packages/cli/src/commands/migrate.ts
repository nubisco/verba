import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import chalk from 'chalk'
import ora from 'ora'

const __dirname = dirname(fileURLToPath(import.meta.url))

function findRoot(): string {
  let dir = resolve(__dirname, '../../..')
  while (dir !== '/') {
    if (existsSync(resolve(dir, 'apps/api'))) return dir
    dir = resolve(dir, '..')
  }
  throw new Error('Could not find Verba project root.')
}

export async function runMigrate(): Promise<void> {
  let root: string
  try {
    root = findRoot()
  } catch (e) {
    console.error(chalk.red((e as Error).message))
    process.exit(1)
  }

  const apiDir = resolve(root, 'apps/api')
  const envPath = resolve(apiDir, '.env')

  if (!existsSync(envPath)) {
    console.error(chalk.red('No .env found in apps/api/. Run `verba setup` first.'))
    process.exit(1)
  }

  const spinner = ora('Running prisma migrate deploy…').start()
  try {
    execSync('npx prisma migrate deploy', { cwd: apiDir, stdio: 'pipe' })
    spinner.succeed('Migrations applied successfully.')
  } catch (err) {
    spinner.fail('Migration failed.')
    console.error(chalk.red((err as Error).message))
    process.exit(1)
  }
}
