/**
 * GET /healthz
 *
 * Returns 200 if the process is up and the database round-trips. The deploy
 * checklist runbook depends on this endpoint being cheap.
 */

import { sql } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';

interface HealthResponse {
  status: 'ok' | 'degraded';
  uptime: number;
  db: 'ok' | 'unreachable';
}

export const healthRoutes: FastifyPluginAsync = async (app) => {
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
