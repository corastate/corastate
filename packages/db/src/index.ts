/**
 * Public surface of @corastate/db.
 *
 * Importers usually want:
 *   import { createDb, schema } from '@corastate/db';
 *
 * Or, when only the schema is needed (e.g. type-only imports elsewhere):
 *   import { observations, type Observation } from '@corastate/db/schema';
 */

export * from './client.js';
export * as schema from './schema.js';
export {
  entities,
  entityKindEnum,
  observations,
  sources,
  syncRuns,
  syncRunStatusEnum,
  keyVersions,
  credentials,
  credentialAccessAudit,
  credentialActionEnum,
  currentStateViewSql,
  currentStateUniqueIndexSql,
  type Entity,
  type EntityKind,
  type NewEntity,
  type NewObservation,
  type NewSyncRun,
  type Observation,
  type Source,
  type NewSource,
  type SyncRun,
  type SyncRunStatus,
  type KeyVersion,
  type NewKeyVersion,
  type Credential,
  type NewCredential,
  type CredentialAccessAuditRow,
  type NewCredentialAccessAuditRow,
  type CredentialAction,
} from './schema.js';
