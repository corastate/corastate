/**
 * Postgres client used by the backend, the CLI, and the core package.
 *
 * Uses postgres.js as the underlying driver. One connection pool per process;
 * tests can build their own pool via `createDb` and a custom connection string.
 */

import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres, { type Sql } from 'postgres';

import * as schema from './schema.js';

export type Database = PostgresJsDatabase<typeof schema>;

export interface CreateDbOptions {
  /** Postgres connection string. Falls back to DATABASE_URL env var. */
  url?: string;
  /** Max pool size. Default 10. */
  max?: number;
  /** Optional logger; passed through to Drizzle. Default false. */
  logger?: boolean;
  /**
   * Surface Postgres NOTICE-level messages. Off by default — the partition
   * migration's `CREATE TABLE IF NOT EXISTS` emits a NOTICE per skipped
   * partition, and they're noise rather than signal. Turn on when debugging.
   */
  notices?: boolean;
}

/**
 * Build a Drizzle client plus the underlying postgres.js handle. Callers that
 * need to close the pool (one-shot scripts, tests) should hold the returned
 * `sql` and call `sql.end()` when they are done. Long-running services do not
 * close it.
 */
export function createDb(options: CreateDbOptions = {}): { db: Database; sql: Sql } {
  const url = options.url ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Copy .env.example to .env or pass options.url to createDb.',
    );
  }

  const sql = postgres(url, {
    max: options.max ?? 10,
    // Postgres returns dates as Date objects; that matches the timestamp columns.
    types: {
      bigint: postgres.BigInt,
    },
    onnotice: options.notices === true ? undefined : () => {},
  });

  const db = drizzle(sql, { schema, logger: options.logger ?? false });
  return { db, sql };
}
