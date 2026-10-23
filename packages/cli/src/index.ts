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

program
  .command('migrate')
  .description(
    'Bring the database in line with the schema (prisma db push, as the Docker image does on start). ' +
      'Changes that would lose data stop unless --accept-data-loss is given.',
  )
  .option('--accept-data-loss', 'apply changes that drop columns, tables or their data (back up first)')
  .action((options: { acceptDataLoss?: boolean }) => runMigrate({ acceptDataLoss: options.acceptDataLoss === true }))

program.parse()
