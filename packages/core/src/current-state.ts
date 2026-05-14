/**
 * Read-side queries against the current_state materialized view.
 *
 * current_state is one row per (entity_id, source, attribute) holding the
 * most recent value. The view is defined in @corastate/db schema.ts; it is
 * refreshed by the framework at the end of each sync run.
 *
 * The functions here are the only sanctioned read path for the v1 API. New
 * read shapes should land here so the SQL surface stays small.
 */

import { sql } from 'drizzle-orm';
import type { Database } from '@corastate/db';
import type { EntityKind } from '@corastate/connector-sdk';

export interface CurrentStateRow {
  entityId: string;
  source: string;
  attribute: string;
  value: unknown;
  observedAt: Date;
  syncRunId: string;
}

/**
 * Pull every current_state row for a given entity. Caller groups by attribute
 * if they want one-row-per-attribute (taking the highest observed_at across
 * sources, for example).
 */
export async function getCurrentStateForEntity(
  db: Database,
  entityId: string,
): Promise<CurrentStateRow[]> {
  const rows = await db.execute<CurrentStateRow>(sql`
    SELECT entity_id    AS "entityId",
           source,
           attribute,
           value,
           observed_at  AS "observedAt",
           sync_run_id  AS "syncRunId"
    FROM   current_state
    WHERE  entity_id = ${entityId}::uuid
  `);
  return rows as unknown as CurrentStateRow[];
}

/**
 * List entities of a given kind, most-recently-updated first. Used by the
 * /v1/devices and /v1/identities routes for the table view.
 */
export async function listEntities(
  db: Database,
  kind: EntityKind,
  limit = 50,
  offset = 0,
): Promise<Array<{ id: string; displayName: string | null; updatedAt: Date }>> {
  const rows = await db.execute<{ id: string; displayName: string | null; updatedAt: Date }>(sql`
    SELECT id,
           display_name AS "displayName",
           updated_at   AS "updatedAt"
    FROM   entities
    WHERE  kind = ${kind}
    ORDER  BY updated_at DESC
    LIMIT  ${limit}
    OFFSET ${offset}
  `);
  return rows as unknown as Array<{
    id: string;
    displayName: string | null;
    updatedAt: Date;
  }>;
}

/**
 * Refresh the materialized view concurrently. Called by the framework at the
 * end of each sync run. CONCURRENTLY requires the unique index that
 * schema.ts/currentStateUniqueIndexSql creates.
 */
export async function refreshCurrentState(db: Database): Promise<void> {
  await db.execute(sql`REFRESH MATERIALIZED VIEW CONCURRENTLY current_state`);
}
