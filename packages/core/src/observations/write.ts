/**
 * Observation-log writer helpers. The sync runner consumes these; they live
 * in core so the correlation engine (Week 3) and any later writer can share
 * them without duplicating the per-attribute fan-out logic.
 *
 * Model: every observation is one row in the observations table, keyed by
 * (entity_id, attribute, observed_at). A single Okta user produces N
 * observations — one per defined field on the canonical partial.
 *
 * Entity resolution in Week 2 is intentionally minimal: each new
 * (source, source_record_id) pair gets a fresh entities row. Cross-source
 * correlation lands in Week 3 (phase-1-sprint-plan-v3.md §"Week 3").
 */

import { and, desc, eq, sql } from 'drizzle-orm';

import {
  entities,
  observations,
  type Database,
  type EntityKind,
  type NewObservation,
} from '@corastate/db';

export interface ObservationInput {
  source: string;
  sourceRecordId: string;
  entityKind: EntityKind;
  /** Canonical partial. Each defined field becomes one observation. */
  partial: Record<string, unknown>;
  syncRunId: string;
  observedAt: Date;
}

/**
 * Resolve an entity id for (source, sourceRecordId), creating a new entity
 * row when no observation has been written for this pair before. The lookup
 * uses observations as the source-of-truth join — that's what the
 * `observations_source_record_time_idx` exists for.
 *
 * Returns the entity id and a flag indicating whether a new row was created.
 */
export async function resolveEntityId(
  db: Database,
  input: { source: string; sourceRecordId: string; entityKind: EntityKind; displayName?: string },
): Promise<{ entityId: string; created: boolean }> {
  const existing = await db
    .select({ entityId: observations.entityId })
    .from(observations)
    .where(
      and(
        eq(observations.source, input.source),
        eq(observations.sourceRecordId, input.sourceRecordId),
      ),
    )
    .orderBy(desc(observations.observedAt))
    .limit(1);

  if (existing.length > 0) {
    return { entityId: existing[0]!.entityId, created: false };
  }

  const [row] = await db
    .insert(entities)
    .values({
      kind: input.entityKind,
      displayName: input.displayName ?? null,
    })
    .returning({ id: entities.id });
  if (!row) throw new Error('resolveEntityId: insert into entities returned no rows');
  return { entityId: row.id, created: true };
}

/**
 * Fan out one canonical partial into N observation rows (one per defined
 * field) and insert them as a single batch.
 *
 * Skips:
 *   - undefined values (the field was not present on the source record)
 *   - the synthetic `id` field — that's the Corastate entity id, not an
 *     observed attribute.
 */
export async function writeObservation(
  db: Database,
  input: ObservationInput,
): Promise<number> {
  const { source, sourceRecordId, entityKind, partial, syncRunId, observedAt } = input;

  const { entityId } = await resolveEntityId(db, {
    source,
    sourceRecordId,
    entityKind,
    displayName: typeof partial.displayName === 'string' ? partial.displayName : undefined,
  });

  const rows: NewObservation[] = [];
  for (const [attribute, value] of Object.entries(partial)) {
    if (value === undefined) continue;
    // null means the source did not observe this attribute on this record;
    // architecturally the same as omitting the observation. The current_state
    // view treats absence and null identically, and the observations.value
    // column is NOT NULL (we'd need `'null'::jsonb` to record a JSON null,
    // which is more bookkeeping than the canonical reader needs).
    if (value === null) continue;
    if (attribute === 'id') continue;
    rows.push({
      observedAt,
      source,
      sourceRecordId,
      entityKind,
      entityId,
      attribute,
      value: value as NewObservation['value'],
      syncRunId,
    });
  }
  if (rows.length === 0) return 0;
  await db.insert(observations).values(rows);
  return rows.length;
}

/**
 * Refresh the current_state materialized view at the end of a sync. The view
 * has a unique index, so `CONCURRENTLY` is safe and avoids blocking readers.
 */
export async function refreshCurrentState(db: Database): Promise<void> {
  // CONCURRENTLY requires an existing view with at least one populated row
  // pattern Postgres can compare against; fall back to a plain refresh on
  // the very first invocation (no rows yet) so the worker doesn't fail.
  try {
    await db.execute(sql`REFRESH MATERIALIZED VIEW CONCURRENTLY current_state`);
  } catch (err) {
    // Fallback: non-concurrent refresh. Phase 1 single-tenant install can
    // afford the brief read lock; the alternative is a 25P02 transaction
    // abort on first run.
    await db.execute(sql`REFRESH MATERIALIZED VIEW current_state`);
    void err;
  }
}
