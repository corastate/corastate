/**
 * The healthz handler factory. Used by both /v1 and /internal namespaces with
 * identical behavior — the same Fastify app serves both, only the URL prefix
 * differs. Architecture-v3.md §"API architecture" sets the structural split.
 */

import { sql } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import type { HealthResponse } from '@corastate/contracts';

export function createHealthzPlugin(): FastifyPluginAsync {
  return async (app) => {
    app.get('/healthz', async (_request, reply): Promise<HealthResponse> => {
      let dbStatus: 'ok' | 'unreachable' = 'ok';
      try {
        await app.db.execute(sql`SELECT 1`);
      } catch (err) {
        app.log.warn({ err }, 'healthz: db ping failed');
        dbStatus = 'unreachable';
      }
      const status: 'ok' | 'degraded' = dbStatus === 'ok' ? 'ok' : 'degraded';
      reply.code(status === 'ok' ? 200 : 503);
      return {
        status,
        uptime: Math.round(process.uptime()),
        db: dbStatus,
      };
    });
  };
}
