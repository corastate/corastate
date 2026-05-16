/**
 * Fastify app factory. Split out from index.ts so tests can build a server
 * without binding a port.
 *
 * The route layout is the v3-locked structural namespace split
 * (architecture-v3.md §"API architecture"):
 *
 *   /v1/*        Stable, versioned, documented. The public surface.
 *   /internal/*  Unversioned, frontend-only. Endpoints graduate from here
 *                to /v1 once their shape is settled.
 *
 * One Fastify app, one contracts package, two namespaces.
 */

import cors from '@fastify/cors';
import sensible from '@fastify/sensible';
import Fastify, { type FastifyInstance } from 'fastify';

import { createDb, type Database } from '@corastate/db';

import { v1Routes } from './routes/v1.js';
import { internalRoutes } from './routes/internal.js';

declare module 'fastify' {
  interface FastifyInstance {
    db: Database;
  }
}

export interface BuildServerOptions {
  /** Override the db client. Tests pass a transactional client here. */
  db?: Database;
  /** Override the logger config. */
  logger?: boolean | Record<string, unknown>;
}

export async function buildServer(options: BuildServerOptions = {}): Promise<FastifyInstance> {
  const pretty = process.env.LOG_PRETTY === '1';
  const logger =
    options.logger ??
    (pretty
      ? {
          level: process.env.LOG_LEVEL ?? 'info',
          transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss.l' } },
        }
      : { level: process.env.LOG_LEVEL ?? 'info' });

  const app = Fastify({ logger });

  let db: Database;
  if (options.db) {
    db = options.db;
  } else {
    const created = createDb();
    db = created.db;
    app.addHook('onClose', async () => {
      await created.sql.end();
    });
  }
  app.decorate('db', db);

  await app.register(sensible);
  await app.register(cors, {
    origin: true,
    credentials: true,
  });

  await app.register(v1Routes, { prefix: '/v1' });
  await app.register(internalRoutes, { prefix: '/internal' });

  return app;
}
