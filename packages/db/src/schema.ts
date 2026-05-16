/**
 * Corastate schema (Drizzle). Aligned to architecture-v3.
 *
 * Tables:
 *   observations            Append-only fact log. Partitioned by date in a
 *                           follow-up migration.
 *   entities                Correlated entities (device, identity, agent).
 *   sync_runs               One row per connector run.
 *   key_versions            Master-key versions. Rotation creates a new row
 *                           and re-wraps every credential's data key.
 *   credentials             Envelope-encrypted secrets per (source, name).
 *   credential_access_audit Append-only log of every encrypt/decrypt event.
 *
 * The credential layer is Phase 1 foundational per architecture-v3
 * §"Credential and security architecture": the storage shape cannot be
 * retrofitted once data exists, so key_version_id, the refresh-token
 * columns, and the audit table are present from the first migration.
 */

import { sql } from 'drizzle-orm';
import {
  bigserial,
  boolean,
  customType,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

// Drizzle's pg-core does not export `bytea` directly. customType is the
// idiomatic escape hatch.
const bytea = customType<{ data: Buffer; default: false }>({
  dataType() {
    return 'bytea';
  },
});

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const entityKindEnum = pgEnum('entity_kind', ['device', 'identity', 'agent']);

export const syncRunStatusEnum = pgEnum('sync_run_status', [
  'running',
  'succeeded',
  'failed',
  'cancelled',
]);

export const credentialActionEnum = pgEnum('credential_action', [
  'encrypt',
  'decrypt',
  'rotate',
  'mark_dead',
]);

// ---------------------------------------------------------------------------
// entities
// ---------------------------------------------------------------------------

export const entities = pgTable(
  'entities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: entityKindEnum('kind').notNull(),
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

export const syncRuns = pgTable(
  'sync_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    connectorId: text('connector_id').notNull(),
    connectorVersion: text('connector_version').notNull(),
    status: syncRunStatusEnum('status').notNull().default('running'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    observationCount: integer('observation_count').notNull().default(0),
    errorMessage: text('error_message'),
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

export const observations = pgTable(
  'observations',
  {
    id: bigserial('id', { mode: 'bigint' }).notNull(),
    observedAt: timestamp('observed_at', { withTimezone: true }).notNull(),
    source: text('source').notNull(),
    sourceRecordId: text('source_record_id').notNull(),
    entityKind: entityKindEnum('entity_kind').notNull(),
    entityId: uuid('entity_id').notNull(),
    attribute: text('attribute').notNull(),
    value: jsonb('value').notNull(),
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
// key_versions
// ---------------------------------------------------------------------------

/**
 * Master-key versions. The KeyProvider knows which version is current; each
 * row records the provider-supplied id of one historical key. Rotation:
 * insert a new row, mark the previous row deactivated_at = now(), re-wrap
 * every credentials.wrapped_data_key with the new master key, update
 * credentials.key_version_id to point at the new row. The re-wrap is cheap
 * because it only touches the small wrapped keys.
 */
export const keyVersions = pgTable(
  'key_versions',
  {
    id: serial('id').primaryKey(),
    /** Provider-supplied id. For the env-var provider, a stable token derived from the key bytes. */
    keyId: text('key_id').notNull(),
    isCurrent: boolean('is_current').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    deactivatedAt: timestamp('deactivated_at', { withTimezone: true }),
  },
  (t) => ({
    keyIdUnique: uniqueIndex('key_versions_key_id_unique').on(t.keyId),
    // Phase 1 invariant: at most one row with is_current=true. Enforced by
    // application logic and a partial unique index added in a follow-up
    // migration once the rotation helper lands.
    currentIdx: index('key_versions_is_current_idx').on(t.isCurrent),
  }),
);

// ---------------------------------------------------------------------------
// credentials
// ---------------------------------------------------------------------------

/**
 * Envelope-encrypted secret per (source_id, name). Connector code references
 * the (source_id, name) pair; values never appear in connector code.
 *
 * Storage layout:
 *   ciphertext / nonce          The secret value, encrypted under data_key (AES-256-GCM).
 *   wrapped_data_key /
 *   wrapped_data_key_nonce      The data key, encrypted under the master key
 *                               named by key_version_id.
 *   aad                         Additional authenticated data passed to GCM.
 *                               Carries (source_id, name) so tampering with
 *                               either field invalidates the ciphertext.
 *   oauth_*                     Refresh-token columns from the start so the
 *                               OAuth lifecycle helpers (Phase 1 Week 1) can
 *                               atomically update both the access token and
 *                               the refresh token in one transaction.
 */
export const credentials = pgTable(
  'credentials',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sourceId: text('source_id').notNull(),
    name: text('name').notNull(),
    ciphertext: bytea('ciphertext').notNull(),
    nonce: bytea('nonce').notNull(),
    wrappedDataKey: bytea('wrapped_data_key').notNull(),
    wrappedDataKeyNonce: bytea('wrapped_data_key_nonce').notNull(),
    keyVersionId: integer('key_version_id').notNull(),
    aad: jsonb('aad').notNull().$type<{ sourceId: string; name: string }>(),
    /** Permanent-failure flag; surfaced to the UI. */
    dead: boolean('dead').notNull().default(false),
    /** OAuth refresh-token ciphertext, encrypted under the same data key. */
    oauthRefreshCiphertext: bytea('oauth_refresh_ciphertext'),
    oauthRefreshNonce: bytea('oauth_refresh_nonce'),
    /** UTC timestamp the access token expires. NULL for non-OAuth credentials. */
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    sourceNameUnique: uniqueIndex('credentials_source_name_unique').on(t.sourceId, t.name),
    keyVersionIdx: index('credentials_key_version_idx').on(t.keyVersionId),
  }),
);

// ---------------------------------------------------------------------------
// credential_access_audit
// ---------------------------------------------------------------------------

/**
 * Append-only log of every decrypt (and encrypt/rotate/mark_dead) event.
 * The observation-log instinct applied to credential access
 * (architecture-v3 §"Credential and security architecture").
 */
export const credentialAccessAudit = pgTable(
  'credential_access_audit',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    credentialId: uuid('credential_id'),
    sourceId: text('source_id').notNull(),
    name: text('name').notNull(),
    syncRunId: uuid('sync_run_id'),
    action: credentialActionEnum('action').notNull(),
    succeeded: boolean('succeeded').notNull(),
    errorMessage: text('error_message'),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    credentialTimeIdx: index('credential_access_audit_credential_time_idx').on(
      t.credentialId,
      t.occurredAt.desc(),
    ),
    sourceTimeIdx: index('credential_access_audit_source_time_idx').on(
      t.sourceId,
      t.occurredAt.desc(),
    ),
  }),
);

// ---------------------------------------------------------------------------
// current_state materialized view (raw SQL)
// ---------------------------------------------------------------------------

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
export type KeyVersion = typeof keyVersions.$inferSelect;
export type NewKeyVersion = typeof keyVersions.$inferInsert;
export type Credential = typeof credentials.$inferSelect;
export type NewCredential = typeof credentials.$inferInsert;
export type CredentialAccessAuditRow = typeof credentialAccessAudit.$inferSelect;
export type NewCredentialAccessAuditRow = typeof credentialAccessAudit.$inferInsert;
export type EntityKind = (typeof entityKindEnum.enumValues)[number];
export type SyncRunStatus = (typeof syncRunStatusEnum.enumValues)[number];
export type CredentialAction = (typeof credentialActionEnum.enumValues)[number];
