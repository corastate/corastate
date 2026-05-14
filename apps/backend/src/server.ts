/**
 * Fastify app factory.
 *
 * Split out from index.ts so tests can build a server without binding a port.
 */

import cors from '@fastify/cors';
import sensible from '@fastify/sensible';
import Fastify, { type FastifyInstance } from 'fastify';

import { createDb, type Database } from '@corastate/db';

import { devicesRoutes } from './routes/devices.js';
import { healthRoutes } from './routes/health.js';
import { identitiesRoutes } from './routes/identities.js';

/**
 * Anything the route handlers reach for via request.server lives here.
 */
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

  // Database client. Tests pass one in; production builds one from env.
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

  await app.register(healthRoutes);
  await app.register(devicesRoutes, { prefix: '/v1' });
  await app.register(identitiesRoutes, { prefix: '/v1' });

  return app;
}
