/**
 * Standalone migration runner. Invoked by `pnpm migrate` and runnable
 * directly with `pnpm --filter @corastate/db run migrate`.
 *
 * Steps, in order:
 *   1. Run Drizzle's generated SQL migrations from ./drizzle. As of Phase 1
 *      Week 1 this includes 0001_observations_partition.sql which converts
 *      the plain observations table to range-partitioned by day.
 *   2. Roll the observations partition window forward (today + 7 future
 *      days). Belt-and-suspenders for installs that haven't wired the
 *      roll-partitions worker to cron yet.
 *   3. (Re-)create the current_state materialized view. The partition
 *      migration drops it; this step re-creates it pointing at the
 *      partitioned parent table.
 */

import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { migrate } from 'drizzle-orm/postgres-js/migrator';
import pino from 'pino';

import { createDb } from './client.js';
import { rollPartitions } from './roll-partitions.js';
import { currentStateUniqueIndexSql, currentStateViewSql } from './schema.js';

const log = pino({ name: 'migrate', level: process.env.LOG_LEVEL ?? 'info' });

async function main(): Promise<void> {
  const { db, sql } = createDb();

  const here = path.dirname(fileURLToPath(import.meta.url));
  const migrationsFolder = path.resolve(here, '..', 'drizzle');

  log.info({ migrationsFolder }, 'running drizzle migrations');
  await migrate(db, { migrationsFolder });

  // Close before invoking rollPartitions — it opens its own connection so it
  // can also be used as a standalone worker.
  await sql.end();

  log.info('rolling observations partition window forward');
  await rollPartitions(7);

  // Re-open for the materialized-view DDL. (rollPartitions closed its own.)
  const { db: db2, sql: sql2 } = createDb();
  log.info('creating current_state materialized view (if not exists)');
  await db2.execute(currentStateViewSql);
  await db2.execute(currentStateUniqueIndexSql);
  await sql2.end();

  log.info('migration complete');
}

main().catch((err: unknown) => {
  log.error({ err }, 'migration failed');
  process.exit(1);
});
