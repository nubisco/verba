import { execSync } from 'node:child_process'
import { existsSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import inquirer from 'inquirer'
import chalk from 'chalk'
import ora from 'ora'
import crypto from 'node:crypto'

const __dirname = dirname(fileURLToPath(import.meta.url))

function findRoot(): string {
  // Walk up from CLI package to find the repo root (contains apps/api)
  let dir = resolve(__dirname, '../../..')
  while (dir !== '/') {
    if (existsSync(resolve(dir, 'apps/api'))) return dir
    dir = resolve(dir, '..')
  }
  throw new Error('Could not find Verba project root. Run this command from within the Verba repository.')
}

export async function runSetupWizard(): Promise<void> {
  console.log(chalk.bold.cyan('\n🌐  Verba Setup Wizard\n'))

  let root: string
  try {
    root = findRoot()
  } catch (e) {
    console.error(chalk.red((e as Error).message))
    process.exit(1)
  }

  const apiDir = resolve(root, 'apps/api')
  const envPath = resolve(apiDir, '.env')

  if (existsSync(envPath)) {
    const { overwrite } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'overwrite',
        message: chalk.yellow('.env already exists. Overwrite?'),
        default: false,
      },
    ])
    if (!overwrite) {
      console.log(chalk.grey('Setup cancelled.'))
      return
    }
  }

  // Database
  const { dbType } = await inquirer.prompt([
    {
      type: 'list',
      name: 'dbType',
      message: 'Database type:',
      choices: [
        { name: 'SQLite  (local dev / single-server)', value: 'sqlite' },
        { name: 'PostgreSQL  (production / multi-process)', value: 'postgres' },
      ],
    },
  ])

  let databaseUrl: string
  if (dbType === 'sqlite') {
    const { sqlitePath } = await inquirer.prompt([
      {
        type: 'input',
        name: 'sqlitePath',
        message: 'SQLite file path:',
        default: './prisma/verba.db',
      },
    ])
    databaseUrl = `file:${sqlitePath}`
  } else {
    const { pgHost, pgPort, pgUser, pgPass, pgDb } = await inquirer.prompt([
      {
        type: 'input',
        name: 'pgHost',
        message: 'Postgres host:',
        default: 'localhost',
      },
      {
        type: 'input',
        name: 'pgPort',
        message: 'Postgres port:',
        default: '5432',
      },
      {
        type: 'input',
        name: 'pgUser',
        message: 'Postgres user:',
        default: 'verba',
      },
      {
        type: 'password',
        name: 'pgPass',
        message: 'Postgres password:',
        mask: '*',
      },
      {
        type: 'input',
        name: 'pgDb',
        message: 'Postgres database:',
        default: 'verba',
      },
    ])
    databaseUrl = `postgresql://${pgUser}:${pgPass}@${pgHost}:${pgPort}/${pgDb}`
  }

  // JWT secret
  const { jwtMode } = await inquirer.prompt([
    {
      type: 'list',
      name: 'jwtMode',
      message: 'JWT secret:',
      choices: [
        { name: 'Auto-generate (recommended)', value: 'auto' },
        { name: 'Enter manually', value: 'manual' },
      ],
    },
  ])
  let jwtSecret: string
  if (jwtMode === 'auto') {
    jwtSecret = crypto.randomBytes(48).toString('hex')
    console.log(chalk.grey(`  Generated JWT secret: ${jwtSecret.slice(0, 12)}…`))
  } else {
    const { manualSecret } = await inquirer.prompt([
      {
        type: 'password',
        name: 'manualSecret',
        message: 'Enter JWT secret (min 32 chars):',
        mask: '*',
        validate: (v: string) => v.length >= 32 || 'Must be at least 32 characters',
      },
    ])
    jwtSecret = manualSecret as string
  }

  // SMTP (optional)
  const { configureSMTP } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'configureSMTP',
      message: 'Configure SMTP for email/OTP sending? (optional)',
      default: false,
    },
  ])

  let smtpVars = ''
  if (configureSMTP) {
    const smtp = await inquirer.prompt([
      { type: 'input', name: 'host', message: 'SMTP host:' },
      { type: 'input', name: 'port', message: 'SMTP port:', default: '587' },
      {
        type: 'input',
        name: 'from',
        message: 'From address:',
        default: 'noreply@verba.app',
      },
      {
        type: 'input',
        name: 'user',
        message: 'SMTP username (leave blank if none):',
      },
      { type: 'password', name: 'pass', message: 'SMTP password:', mask: '*' },
      {
        type: 'confirm',
        name: 'secure',
        message: 'Use TLS (port 465)?',
        default: false,
      },
    ])
    smtpVars = [
      `SMTP_HOST=${smtp.host}`,
      `SMTP_PORT=${smtp.port}`,
      `SMTP_FROM=${smtp.from}`,
      smtp.user ? `SMTP_USER=${smtp.user}` : '',
      smtp.pass ? `SMTP_PASS=${smtp.pass}` : '',
      `SMTP_SECURE=${smtp.secure}`,
    ]
      .filter(Boolean)
      .join('\n')
  }

  // Write .env
  const envContent =
    [`DATABASE_URL="${databaseUrl}"`, `JWT_SECRET="${jwtSecret}"`, `PORT=4000`, smtpVars].filter(Boolean).join('\n') +
    '\n'

  writeFileSync(envPath, envContent, 'utf8')
  console.log(chalk.green(`\n✔  Written ${envPath}`))

  // Run migrations
  const { runMigrateNow } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'runMigrateNow',
      message: 'Run database migrations now?',
      default: true,
    },
  ])

  if (runMigrateNow) {
    const spinner = ora('Running prisma migrate deploy…').start()
    try {
      execSync('npx prisma migrate deploy', { cwd: apiDir, stdio: 'pipe' })
      spinner.succeed('Migrations applied.')
    } catch (err) {
      spinner.fail('Migration failed. Check your database connection.')
      console.error(chalk.red((err as Error).message))
    }
  }

  console.log(chalk.bold.green('\n✅  Setup complete!\n'))
  console.log('Start the API server:')
  console.log(chalk.cyan('  cd apps/api && pnpm dev\n'))
  console.log('Start the web app:')
  console.log(chalk.cyan('  cd apps/web && pnpm dev\n'))
  console.log('The first user who registers will become the global admin.\n')
}
