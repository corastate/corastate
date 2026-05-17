/**
 * Partition rollover worker. Idempotently ensures observations partitions
 * exist for today and the next N days (default 7).
 *
 * Stock postgres:16-alpine does not ship pg_cron, so this is a Node script
 * the operator runs from cron / systemd timer / k8s CronJob daily. It is
 * also called from migrate.ts on every boot as a belt-and-suspenders, so
 * a freshly-cloned dev install always has a healthy partition window.
 *
 * Usage:
 *   pnpm --filter @corastate/db run roll-partitions
 *   pnpm --filter @corastate/db run roll-partitions -- --days=14
 */

import { sql } from 'drizzle-orm';
import pino from 'pino';

import { createDb } from './client.js';

const DEFAULT_DAYS_FORWARD = 7;

interface Options {
  daysForward: number;
}

function parseArgs(argv: string[]): Options {
  let daysForward = DEFAULT_DAYS_FORWARD;
  for (const arg of argv) {
    const match = /^--days=(\d+)$/.exec(arg);
    if (match) daysForward = Number.parseInt(match[1]!, 10);
  }
  if (!Number.isFinite(daysForward) || daysForward < 0) {
    throw new Error(`roll-partitions: --days must be a non-negative integer (got ${daysForward}).`);
  }
  return { daysForward };
}

export async function rollPartitions(daysForward: number): Promise<{ created: number }> {
  const { db, sql: pg } = createDb();
  const log = pino({ name: 'roll-partitions', level: process.env.LOG_LEVEL ?? 'info' });

  log.info({ daysForward }, 'ensuring observations partitions');

  try {
    // daysForward is validated to a non-negative integer in parseArgs (and
    // the only callers pass a literal). Inline as raw SQL so the DO block
    // body, which Postgres parses standalone, has a concrete value rather
    // than a typed parameter placeholder it cannot resolve.
    await db.execute(
      sql.raw(`
        DO $$
        DECLARE
          d date;
        BEGIN
          FOR d IN
            SELECT generate_series(
              CURRENT_DATE,
              CURRENT_DATE + INTERVAL '${daysForward} days',
              INTERVAL '1 day'
            )::date
          LOOP
            PERFORM create_observations_partition(d);
          END LOOP;
        END;
        $$;
      `),
    );
    log.info({ daysForward }, 'partition window healthy');
    return { created: daysForward + 1 };
  } finally {
    await pg.end();
  }
}

const isMain =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith('/roll-partitions.ts') === true ||
  process.argv[1]?.endsWith('/roll-partitions.js') === true;

if (isMain) {
  const log = pino({ name: 'roll-partitions', level: process.env.LOG_LEVEL ?? 'info' });
  const opts = parseArgs(process.argv.slice(2));
  rollPartitions(opts.daysForward).catch((err: unknown) => {
    log.error({ err }, 'partition rollover failed');
    process.exit(1);
  });
}
