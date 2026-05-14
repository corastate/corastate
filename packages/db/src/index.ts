/**
 * Public surface of @corastate/db.
 *
 * Importers usually want:
 *   import { createDb, schema } from '@corastate/db';
 *
 * Or, when only the schema is needed (e.g. type-only imports in the SDK):
 *   import { observations, type Observation } from '@corastate/db/schema';
 */

export * from './client.js';
export * as schema from './schema.js';
export {
  entities,
  entityKindEnum,
  observations,
  syncRuns,
  syncRunStatusEnum,
  currentStateViewSql,
  currentStateUniqueIndexSql,
  type Entity,
  type EntityKind,
  type NewEntity,
  type NewObservation,
  type NewSyncRun,
  type Observation,
  type SyncRun,
  type SyncRunStatus,
} from './schema.js';
