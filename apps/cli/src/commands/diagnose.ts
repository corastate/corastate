/**
 * `corastate diagnose`
 *
 * One-shot health check used during onboarding and when a customer opens a
 * support ticket. Goal: every check produces a single line of output, ok or
 * not ok plus a one-line reason.
 *
 * Checks (planned):
 *   - DATABASE_URL is set and reachable.
 *   - All expected tables exist (observations, entities, sync_runs).
 *   - current_state materialized view exists and was refreshed in the last hour.
 *   - Each configured connector authenticates.
 */

import { sql } from 'drizzle-orm';
import type { Command } from 'commander';

import { createDb } from '@corastate/db';

interface CheckResult {
  name: string;
  ok: boolean;
  detail: string;
}

async function checkDatabase(): Promise<CheckResult[]> {
  const out: CheckResult[] = [];
  if (!process.env.DATABASE_URL) {
    return [{ name: 'database.env', ok: false, detail: 'DATABASE_URL not set' }];
  }
  out.push({ name: 'database.env', ok: true, detail: 'DATABASE_URL is set' });

  try {
    const { db, sql: pg } = createDb();
    await db.execute(sql`SELECT 1`);
    await pg.end();
    out.push({ name: 'database.connect', ok: true, detail: 'connected and round-tripped' });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    out.push({ name: 'database.connect', ok: false, detail: message });
  }
  return out;
}

export function registerDiagnose(program: Command): void {
  program
    .command('diagnose')
    .description('Print a health summary of the local install')
    .action(async () => {
      const results: CheckResult[] = [];
      results.push(...(await checkDatabase()));
      // TODO: table-exists checks, materialized-view freshness, connector auth.

      const pad = Math.max(...results.map((r) => r.name.length));
      for (const r of results) {
        const mark = r.ok ? 'ok  ' : 'FAIL';
        console.log(`${mark}  ${r.name.padEnd(pad)}  ${r.detail}`);
      }
      const anyFail = results.some((r) => !r.ok);
      process.exitCode = anyFail ? 1 : 0;
    });
}
