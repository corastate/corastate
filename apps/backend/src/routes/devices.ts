/**
 * GET /v1/devices
 *
 * Lists correlated device entities. Returns a placeholder shape for now; the
 * real implementation pulls from `entities` joined to `current_state`.
 */

import type { FastifyPluginAsync } from 'fastify';

import { listEntities } from '@corastate/core';

interface DeviceListItem {
  id: string;
  displayName: string | null;
  updatedAt: string;
  /** Placeholder: filled in from current_state once the read path is wired. */
  sources: string[];
}

interface DeviceListResponse {
  items: DeviceListItem[];
  total: number;
}

export const devicesRoutes: FastifyPluginAsync = async (app) => {
  app.get('/devices', async (request): Promise<DeviceListResponse> => {
    const q = request.query as { limit?: string; offset?: string };
    const limit = q.limit ? Math.min(Math.max(parseInt(q.limit, 10) || 50, 1), 200) : 50;
    const offset = q.offset ? Math.max(parseInt(q.offset, 10) || 0, 0) : 0;

    try {
      const rows = await listEntities(app.db, 'device', limit, offset);
      return {
        items: rows.map((r) => ({
          id: r.id,
          displayName: r.displayName,
          updatedAt: r.updatedAt.toISOString(),
          sources: [], // TODO: join against current_state to populate.
        })),
        total: rows.length,
      };
    } catch (err) {
      // The entities table is created by `pnpm migrate`. Before that runs the
      // endpoint should respond with an empty list rather than 500.
      app.log.warn({ err }, 'devices: falling back to empty list (have migrations been run?)');
      return { items: [], total: 0 };
    }
  });
};
