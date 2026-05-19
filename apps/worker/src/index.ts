/**
 * Corastate background sync worker.
 *
 * One Node process whose job is to walk every active source, run the
 * generic sync runner against it, and sleep until the next pass. Per the
 * v3 architecture (§"Credential and security architecture") this is the
 * only process that holds the master key — the API process intentionally
 * cannot decrypt credentials.
 *
 * Phase 1 cadence: poll-every-N-minutes. A real scheduler (Temporal or
 * pg-boss) is a later phase; the polling loop is enough for the OSS
 * single-tenant install the Phase 1 gate calls for.
 */

import { sql } from 'drizzle-orm';
import pino from 'pino';

import { createDb, sources, type Source } from '@corastate/db';
import { EnvKeyProvider, pinoRedact, runSync } from '@corastate/core';
import { eq } from 'drizzle-orm';

import { buildConnector } from './connector-factory.js';

const DEFAULT_POLL_INTERVAL_MS = 5 * 60 * 1000;

interface WorkerConfig {
  pollIntervalMs: number;
  /** Run one pass and exit. Used by the integration test path. */
  runOnce: boolean;
}

function readConfig(): WorkerConfig {
  const interval = Number(process.env.WORKER_POLL_INTERVAL_MS ?? DEFAULT_POLL_INTERVAL_MS);
  return {
    pollIntervalMs: Number.isFinite(interval) && interval > 0 ? interval : DEFAULT_POLL_INTERVAL_MS,
    runOnce: process.env.WORKER_RUN_ONCE === '1',
  };
}

async function tick(log: pino.Logger): Promise<void> {
  const { db, sql: pg } = createDb();
  try {
    const active = await db
      .select()
      .from(sources)
      .where(eq(sources.active, true));

    if (active.length === 0) {
      log.debug('worker: no active sources; sleeping');
      return;
    }

    const keyProvider = new EnvKeyProvider();

    for (const source of active) {
      await syncOneSource(log, db, keyProvider, source);
    }
  } finally {
    await pg.end();
  }
}

async function syncOneSource(
  log: pino.Logger,
  db: ReturnType<typeof createDb>['db'],
  keyProvider: EnvKeyProvider,
  source: Source,
): Promise<void> {
  const child = log.child({
    sourceId: source.id,
    connectorId: source.connectorId,
    displayName: source.displayName,
  });
  try {
    const connector = buildConnector({
      connectorId: source.connectorId,
      config: source.config,
    });
    const result = await runSync({
      sourceId: source.id,
      connector,
      db,
      keyProvider,
      log: child,
    });
    child.info({ result }, 'worker: source sync succeeded');
  } catch (err) {
    child.error({ err }, 'worker: source sync failed');
  }
}

async function main(): Promise<void> {
  const config = readConfig();
  const pretty = process.env.LOG_PRETTY === '1';
  const log = pino({
    level: process.env.LOG_LEVEL ?? 'info',
    name: 'worker',
    redact: pinoRedact(),
    ...(pretty
      ? { transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss.l' } } }
      : {}),
  });

  log.info(
    {
      pollIntervalMs: config.pollIntervalMs,
      runOnce: config.runOnce,
      keyProviderEnvVar: process.env.CORASTATE_MASTER_KEY ? 'set' : 'missing',
    },
    'worker: starting',
  );

  // Fail fast at boot if the master key is missing — the worker is useless
  // without it (it can't decrypt any credential).
  try {
    await new EnvKeyProvider().getCurrentKey();
  } catch (err) {
    log.error({ err }, 'worker: CORASTATE_MASTER_KEY is invalid or missing; exiting');
    process.exit(1);
  }

  // Sanity-check the database connection once before entering the loop.
  {
    const { db, sql: pg } = createDb();
    try {
      await db.execute(sql`SELECT 1`);
    } finally {
      await pg.end();
    }
  }

  let stopping = false;
  const onSignal = (signal: string): void => {
    log.info({ signal }, 'worker: shutting down');
    stopping = true;
  };
  process.on('SIGTERM', () => onSignal('SIGTERM'));
  process.on('SIGINT', () => onSignal('SIGINT'));

  for (;;) {
    if (stopping) break;
    try {
      await tick(log);
    } catch (err) {
      log.error({ err }, 'worker: tick failed');
    }
    if (config.runOnce) break;
    await sleep(config.pollIntervalMs, () => stopping);
  }

  log.info('worker: stopped');
}

function sleep(ms: number, isStopping: () => boolean): Promise<void> {
  return new Promise((resolve) => {
    const step = Math.min(ms, 1000);
    const start = Date.now();
    const tick = (): void => {
      if (isStopping() || Date.now() - start >= ms) {
        resolve();
        return;
      }
      setTimeout(tick, step);
    };
    tick();
  });
}

main().catch((err: unknown) => {
  console.error('worker: fatal', err);
  process.exit(1);
});
