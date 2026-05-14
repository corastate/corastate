/**
 * Corastate schema (Drizzle).
 *
 * The shape here is the canonical version of the sketch in the architecture
 * doc. Three tables carry the system:
 *
 *   observations  Append-only log of every (source, entity, attribute, value)
 *                 fact a connector has ever reported. Partitioned by date.
 *   entities      Corastate-internal correlated identifiers. An entity is one
 *                 device, identity, or agent across however many source tools
 *                 happen to know about it.
 *   sync_runs     One row per connector run. Every observation carries the
 *                 sync_run_id that produced it, which is what lets us answer
 *                 "where did this value come from" in a single join.
 *
 * Drizzle does not emit PARTITION BY today. The observations table is declared
 * as a plain table here; the partition conversion lives in drizzle/0001_partition.sql
 * and runs after the generated migration.
 */

import { sql } from 'drizzle-orm';
import {
  bigserial,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/**
 * The kinds of things Corastate can correlate. v1 covers devices, identities,
 * and agents. Future kinds (license, saas_app) can be added without rewriting
 * the observation log.
 */
export const entityKindEnum = pgEnum('entity_kind', ['device', 'identity', 'agent']);

/**
 * Lifecycle states for a single connector run.
 *   running    The run has started and has not finished.
 *   succeeded  The run finished, no fatal error.
 *   failed     The run hit an error the connector could not recover from.
 *   cancelled  An operator stopped the run before it finished.
 */
export const syncRunStatusEnum = pgEnum('sync_run_status', [
  'running',
  'succeeded',
  'failed',
  'cancelled',
]);

// ---------------------------------------------------------------------------
// entities
// ---------------------------------------------------------------------------

/**
 * One row per correlated thing (device, identity, or agent). The id is the
 * `entity_id` referenced from observations. Source-specific identifiers stay
 * in observations as source_record_id; the correlation engine writes a row
 * here when it decides two source records are the same underlying entity.
 */
export const entities = pgTable(
  'entities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: entityKindEnum('kind').notNull(),
    /**
     * Human-readable label for the entity. Picked by the correlation engine
     * from the most useful attribute it can find (hostname for devices,
     * primary email for identities). Not authoritative; the truth is in
     * observations.
     */
    displayName: text('display_name'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    kindIdx: index('entities_kind_idx').on(t.kind),
    updatedAtIdx: index('entities_updated_at_idx').on(t.updatedAt),
  }),
);

// ---------------------------------------------------------------------------
// sync_runs
// ---------------------------------------------------------------------------

/**
 * One row per connector run. Append-only in normal operation; the only update
 * that should happen is the transition from running to one of the terminal
 * states when the run finishes.
 */
export const syncRuns = pgTable(
  'sync_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Connector id, e.g. 'okta', 'crowdstrike-falcon'. */
    connectorId: text('connector_id').notNull(),
    /** Connector version (semver) for traceability. */
    connectorVersion: text('connector_version').notNull(),
    status: syncRunStatusEnum('status').notNull().default('running'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    /** Count of observations the run wrote. Updated when the run finishes. */
    observationCount: integer('observation_count').notNull().default(0),
    /** First fatal error message, if any. */
    errorMessage: text('error_message'),
    /**
     * Free-form context: pagination cursor for incremental syncs, rate-limit
     * back-off counters, anything else the connector wants to record on the
     * run itself rather than as observations.
     */
    context: jsonb('context').$type<Record<string, unknown>>(),
  },
  (t) => ({
    connectorStartedIdx: index('sync_runs_connector_started_idx').on(
      t.connectorId,
      t.startedAt.desc(),
    ),
    statusIdx: index('sync_runs_status_idx').on(t.status),
  }),
);

// ---------------------------------------------------------------------------
// observations
// ---------------------------------------------------------------------------

/**
 * The append-only fact log.
 *
 * Primary key is (observed_at, id). The compound key is required because
 * Postgres demands the partition key be part of any unique constraint on a
 * partitioned table, and we partition by observed_at.
 *
 * Two indexes match the two access patterns the architecture doc calls out:
 *   - (entity_id, attribute, observed_at DESC) for current-state lookups.
 *   - (source, source_record_id, observed_at DESC) for connector-side
 *     deduplication and "did this source change anything since last run."
 */
export const observations = pgTable(
  'observations',
  {
    id: bigserial('id', { mode: 'bigint' }).notNull(),
    observedAt: timestamp('observed_at', { withTimezone: true }).notNull(),
    /** Connector id that produced the observation (e.g. 'okta'). */
    source: text('source').notNull(),
    /** Vendor's primary key for the record at the source. */
    sourceRecordId: text('source_record_id').notNull(),
    entityKind: entityKindEnum('entity_kind').notNull(),
    /** Corastate-internal correlated id. Joins to entities.id. */
    entityId: uuid('entity_id').notNull(),
    /** Attribute name, e.g. 'os_version', 'disk_encryption', 'last_check_in'. */
    attribute: text('attribute').notNull(),
    /** Attribute value. JSONB so we can store strings, numbers, booleans, and small structs uniformly. */
    value: jsonb('value').notNull(),
    /** The sync run that produced this row. Joins to sync_runs.id. */
    syncRunId: uuid('sync_run_id').notNull(),
  },
  (t) => ({
    pk: primaryKey({ name: 'observations_pkey', columns: [t.observedAt, t.id] }),
    entityAttrTime: index('observations_entity_attr_time_idx').on(
      t.entityId,
      t.attribute,
      t.observedAt.desc(),
    ),
    sourceRecordTime: index('observations_source_record_time_idx').on(
      t.source,
      t.sourceRecordId,
      t.observedAt.desc(),
    ),
    syncRunIdx: index('observations_sync_run_idx').on(t.syncRunId),
  }),
);

// ---------------------------------------------------------------------------
// Raw SQL fragments
// ---------------------------------------------------------------------------

/**
 * SQL for the current_state materialized view. The view is the read path for
 * "the most recent value per (entity, source, attribute)." It is refreshed
 * concurrently by the connector framework at the end of each sync run.
 *
 * We keep this as a sql template rather than a Drizzle table because Drizzle
 * does not model materialized views directly. The migrate command in the CLI
 * runs this after the generated schema migration.
 */
export const currentStateViewSql = sql`
  CREATE MATERIALIZED VIEW IF NOT EXISTS current_state AS
  SELECT DISTINCT ON (entity_id, source, attribute)
    entity_id,
    source,
    attribute,
    value,
    observed_at,
    sync_run_id
  FROM observations
  ORDER BY entity_id, source, attribute, observed_at DESC;
`;

export const currentStateUniqueIndexSql = sql`
  CREATE UNIQUE INDEX IF NOT EXISTS current_state_unique_idx
    ON current_state (entity_id, source, attribute);
`;

// ---------------------------------------------------------------------------
// Inferred row types
// ---------------------------------------------------------------------------

export type Entity = typeof entities.$inferSelect;
export type NewEntity = typeof entities.$inferInsert;

export type SyncRun = typeof syncRuns.$inferSelect;
export type NewSyncRun = typeof syncRuns.$inferInsert;

export type Observation = typeof observations.$inferSelect;
export type NewObservation = typeof observations.$inferInsert;

export type EntityKind = (typeof entityKindEnum.enumValues)[number];
export type SyncRunStatus = (typeof syncRunStatusEnum.enumValues)[number];
