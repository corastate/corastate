#!/usr/bin/env node
/**
 * Corastate CLI entrypoint.
 *
 * Commands:
 *   corastate sync <connector>   Run a connector sync once.
 *   corastate diagnose           Print a health summary.
 *   corastate migrate            Apply pending database migrations.
 *   corastate seed               Load demo data so the UI has something to show.
 *
 * The CLI is allowed to console.log (operator-facing). Anything that would go
 * to a log aggregator should go through pino instead.
 */

import { Command } from 'commander';

import { registerDiagnose } from './commands/diagnose.js';
import { registerMigrate } from './commands/migrate.js';
import { registerSeed } from './commands/seed.js';
import { registerSync } from './commands/sync.js';

const program = new Command();

program
  .name('corastate')
  .description('Corastate operator CLI')
  .version('0.1.0');

registerSync(program);
registerDiagnose(program);
registerMigrate(program);
registerSeed(program);

program.parseAsync(process.argv).catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`corastate: ${message}`);
  process.exit(1);
});
