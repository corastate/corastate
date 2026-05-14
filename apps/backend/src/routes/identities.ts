/**
 * GET /v1/identities
 *
 * Lists correlated identity entities. Same shape as devices for now.
 */

import type { FastifyPluginAsync } from 'fastify';

import { listEntities } from '@corastate/core';

interface IdentityListItem {
  id: string;
  displayName: string | null;
  updatedAt: string;
  sources: string[];
}

interface IdentityListResponse {
  items: IdentityListItem[];
  total: number;
}

export const identitiesRoutes: FastifyPluginAsync = async (app) => {
  app.get('/identities', async (request): Promise<IdentityListResponse> => {
    const q = request.query as { limit?: string; offset?: string };
    const limit = q.limit ? Math.min(Math.max(parseInt(q.limit, 10) || 50, 1), 200) : 50;
    const offset = q.offset ? Math.max(parseInt(q.offset, 10) || 0, 0) : 0;

    try {
      const rows = await listEntities(app.db, 'identity', limit, offset);
      return {
        items: rows.map((r) => ({
          id: r.id,
          displayName: r.displayName,
          updatedAt: r.updatedAt.toISOString(),
          sources: [],
        })),
        total: rows.length,
      };
    } catch (err) {
      app.log.warn({ err }, 'identities: falling back to empty list (have migrations been run?)');
      return { items: [], total: 0 };
    }
  });
};
