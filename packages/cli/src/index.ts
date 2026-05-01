#!/usr/bin/env node
import { Command } from 'commander'
import { runSetupWizard } from './commands/setup.js'
import { runMigrate } from './commands/migrate.js'

const program = new Command()

program.name('verba').description('Verba i18n platform CLI').version('0.1.0')

program
  .command('setup')
  .description('Interactive setup wizard: configure database, create admin user, generate .env')
  .action(runSetupWizard)

program.command('migrate').description('Run database migrations (prisma migrate deploy)').action(runMigrate)

program.parse()
