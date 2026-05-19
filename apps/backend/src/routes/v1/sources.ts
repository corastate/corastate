/**
 * GET /v1/sources — list configured connector sources with their most-recent
 * sync's start time and status. Implements the Week-2 deliverable from
 * phase-1-sprint-plan-v3.md §"Week 2": a stable, contracts-validated view
 * of every source the worker iterates.
 *
 * The "last sync" join uses a LATERAL subquery per source so each row carries
 * the latest run without dragging the whole sync_runs table into memory.
 */

import { sql } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';

import {
  sourceListResponseSchema,
  type SourceListResponse,
  type SourceStatus,
} from '@corastate/contracts';

export const sourcesRoutes: FastifyPluginAsync = async (app) => {
  app.get('/sources', async (_request, reply): Promise<SourceListResponse> => {
    const rows = await app.db.execute(sql<{
      id: string;
      name: string;
      type: string;
      active: boolean;
      last_synced_at: Date | null;
      last_status: string | null;
    }>`
      SELECT
        s.id::text          AS id,
        s.display_name      AS name,
        s.connector_id      AS type,
        s.active            AS active,
        latest.started_at   AS last_synced_at,
        latest.status::text AS last_status
      FROM sources s
      LEFT JOIN LATERAL (
        SELECT started_at, status
        FROM sync_runs
        WHERE source_id = s.id
        ORDER BY started_at DESC
        LIMIT 1
      ) latest ON TRUE
      ORDER BY s.created_at ASC, s.id ASC
    `);

    const items = (rows as unknown as Array<{
      id: string;
      name: string;
      type: string;
      active: boolean;
      last_synced_at: Date | string | null;
      last_status: string | null;
    }>).map((r) => ({
      id: r.id,
      name: r.name,
      type: r.type,
      active: r.active,
      lastSyncedAt: r.last_synced_at ? new Date(r.last_synced_at) : null,
      status: toSourceStatus(r.last_status),
    }));

    const validated = sourceListResponseSchema.parse({ items, total: items.length });
    reply.code(200);
    return validated;
  });
};

function toSourceStatus(raw: string | null): SourceStatus {
  if (raw === null) return 'idle';
  switch (raw) {
    case 'running':
    case 'succeeded':
    case 'failed':
    case 'cancelled':
      return raw;
    default:
      return 'idle';
  }
}
