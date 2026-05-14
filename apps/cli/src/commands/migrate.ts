/**
 * `corastate migrate`
 *
 * Applies pending Drizzle migrations, the hand-rolled partition conversion,
 * and (re)creates the current_state materialized view. The heavy lifting
 * lives in @corastate/db's migrate.ts; this command shells over to it so
 * operators only have to remember one command.
 */

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { spawn } from 'node:child_process';

import type { Command } from 'commander';

export function registerMigrate(program: Command): void {
  program
    .command('migrate')
    .description('Apply database migrations and refresh the current_state view')
    .action(async () => {
      const here = path.dirname(fileURLToPath(import.meta.url));
      // Resolve to packages/db/src/migrate.ts from apps/cli/src/commands/migrate.ts.
      const migrateScript = path.resolve(
        here,
        '..',
        '..',
        '..',
        '..',
        'packages',
        'db',
        'src',
        'migrate.ts',
      );

      console.log(`corastate migrate: running ${migrateScript}`);

      await new Promise<void>((resolve, reject) => {
        const child = spawn('tsx', [migrateScript], {
          stdio: 'inherit',
          env: process.env,
        });
        child.on('error', reject);
        child.on('exit', (code) => {
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`migrate exited with code ${code ?? 'null'}`));
          }
        });
      });
    });
}
