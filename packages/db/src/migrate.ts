/**
 * Standalone migration runner. Invoked by the CLI's `migrate` command and
 * usable on its own with `pnpm --filter @corastate/db run migrate`.
 *
 * Three steps, in order:
 *   1. Run Drizzle's generated SQL migrations from ./drizzle.
 *   2. Apply the partition conversion (drizzle/0001_partition.sql once it exists).
 *   3. Create or refresh the current_state materialized view.
 *
 * Step 2 is a TODO. The generated migration creates a normal table; the hand
 * rolled file converts it to a partitioned table and creates the first set
 * of daily partitions. Until that file is written, this script logs a warning
 * and continues.
 */

import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { migrate } from 'drizzle-orm/postgres-js/migrator';
import pino from 'pino';

import { createDb } from './client.js';
import { currentStateUniqueIndexSql, currentStateViewSql } from './schema.js';

const log = pino({ name: 'migrate', level: process.env.LOG_LEVEL ?? 'info' });

async function main(): Promise<void> {
  const { db, sql } = createDb();

  const here = path.dirname(fileURLToPath(import.meta.url));
  const migrationsFolder = path.resolve(here, '..', 'drizzle');

  log.info({ migrationsFolder }, 'running drizzle migrations');
  await migrate(db, { migrationsFolder });

  // TODO: apply drizzle/0001_partition.sql once written. The partition
  // conversion has to be done outside Drizzle's generator and lives as a raw
  // SQL file alongside the generated migrations.
  log.warn(
    'partition conversion step is a TODO. The observations table will work as a plain table until 0001_partition.sql lands.',
  );

  log.info('creating current_state materialized view (if not exists)');
  await db.execute(currentStateViewSql);
  await db.execute(currentStateUniqueIndexSql);

  await sql.end();
  log.info('migration complete');
}

main().catch((err: unknown) => {
  log.error({ err }, 'migration failed');
  process.exit(1);
});
