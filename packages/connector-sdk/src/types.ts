/**
 * The connector contract.
 *
 * The shape here mirrors the sketch in the architecture doc. The capability
 * registration model is the load-bearing piece: a connector says what it can
 * do, the framework decides what to ask of it. If a capability is not
 * declared, the framework will not call the matching code path.
 *
 * Three rules the framework enforces against this contract:
 *   1. `execute` is only ever called if a matching `WriteCapability` was declared.
 *   2. Webhook payloads are only accepted for declared `WebhookCapability` kinds.
 *   3. UI features (action buttons, filters) are gated on capability presence.
 */

// ---------------------------------------------------------------------------
// Entity and observation shapes that match the db package
// ---------------------------------------------------------------------------

/**
 * Kinds of things a connector can observe. Aligned with entity_kind in the db
 * schema. Add new kinds here and in the schema in lockstep.
 */
export type EntityKind = 'device' | 'identity' | 'agent';

/**
 * Compliance signals a connector can emit. These are strings rather than a
 * sealed union so that a connector for a vendor with vendor-specific signals
 * (e.g. CrowdStrike's "sensorVersion") can name them without a framework
 * change. The framework treats unknown signals as opaque attributes.
 */
export type ComplianceSignal =
  | 'agentRunning'
  | 'lastCheckIn'
  | 'sensorVersion'
  | 'diskEncryption'
  | 'osVersion'
  | 'mdmEnrolled'
  | 'compliancePolicyState'
  | (string & {});

// ---------------------------------------------------------------------------
// Capabilities
// ---------------------------------------------------------------------------

/**
 * A read capability is the connector advertising one stream of observations
 * it can produce. `supportsIncremental` means the connector can fetch only
 * what has changed since the last sync (cursor, watermark, or webhook-driven);
 * if false the framework will run a full sweep every time.
 *
 * The `compliance` variant is different: instead of a stream of entities it
 * is a stream of attributes, and the `emits` array tells the framework which
 * attribute names to expect. This matters because the UI uses it to decide
 * which compliance columns to render.
 */
export type ReadCapability =
  | { kind: 'devices'; supportsIncremental: boolean }
  | { kind: 'identities'; supportsIncremental: boolean }
  | { kind: 'agents'; supportsIncremental: boolean }
  | { kind: 'compliance'; emits: ComplianceSignal[] };

/**
 * Write capabilities. v1 connectors leave this undefined; v2 commercial
 * connectors add at least one entry.
 *
 * - setComplianceState: push a compliance verdict back to the vendor.
 *   `allowedValues` is the set the vendor accepts (e.g. ['compliant', 'noncompliant']).
 * - triggerSync: ask the vendor to refresh its picture of a device or tenant.
 * - isolateDevice: network-isolate or quarantine an endpoint. `reversible`
 *   tells the framework whether the action can be undone in the same way it
 *   was applied.
 */
export type WriteCapability =
  | { kind: 'setComplianceState'; allowedValues: string[] }
  | { kind: 'triggerSync'; scope: 'device' | 'tenant' }
  | { kind: 'isolateDevice'; reversible: boolean };

/**
 * Webhook capabilities. Some vendors push updates rather than waiting to be
 * polled. The framework spins up a receiver per declared webhook kind and
 * verifies signatures using the named scheme.
 */
export type WebhookCapability = {
  kind: 'deviceUpdated' | 'identityUpdated' | 'complianceChanged' | (string & {});
  verify: 'hmac-sha256' | 'jwt' | 'none';
};

export interface ConnectorCapabilities {
  reads: ReadCapability[];
  writes?: WriteCapability[];
  webhooks?: WebhookCapability[];
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

/**
 * Each connector decides the shape of its own auth config. The framework
 * passes whatever the operator entered in the UI or the env file; the
 * connector validates it.
 */
export type AuthConfig = Record<string, unknown>;

export type AuthResult =
  | { ok: true; expiresAt?: Date }
  | { ok: false; reason: string };

// ---------------------------------------------------------------------------
// Sync context and observations
// ---------------------------------------------------------------------------

export interface Logger {
  debug(obj: unknown, msg?: string): void;
  info(obj: unknown, msg?: string): void;
  warn(obj: unknown, msg?: string): void;
  error(obj: unknown, msg?: string): void;
}

/**
 * Everything a connector needs at runtime that is not its own config.
 *
 * `since` is the watermark for incremental syncs (the last successful run's
 * finishedAt). A first run, or a full sweep, has `since` undefined.
 *
 * `signal` is an AbortSignal the framework triggers when the operator cancels
 * the run; connectors should check it between page fetches and bail out cleanly.
 */
export interface SyncContext {
  runId: string;
  connectorId: string;
  since?: Date;
  signal: AbortSignal;
  log: Logger;
}

/**
 * What a connector yields from `sync`. The framework writes one row in the
 * observations table per yield.
 *
 * `observedAt` defaults to "now" at write time if the connector does not set
 * it. Connectors that have a vendor-supplied "last reported" timestamp should
 * set it explicitly so the log reflects when the vendor saw the value, not
 * when we asked.
 */
export interface Observation {
  source: string;
  sourceRecordId: string;
  entityKind: EntityKind;
  /** Optional Corastate-internal entity id. If absent, the correlation engine assigns one. */
  entityId?: string;
  attribute: string;
  value: unknown;
  observedAt?: Date;
}

/**
 * Sync run summary, mirrored from the db row.
 */
export interface SyncRun {
  id: string;
  connectorId: string;
  connectorVersion: string;
  status: 'running' | 'succeeded' | 'failed' | 'cancelled';
  startedAt: Date;
  finishedAt?: Date;
  observationCount: number;
  errorMessage?: string;
}

// ---------------------------------------------------------------------------
// Write actions (v2)
// ---------------------------------------------------------------------------

/**
 * A write action the framework asks a connector to perform. The shape mirrors
 * WriteCapability one-to-one; the framework refuses to construct an action
 * whose kind the connector did not declare.
 */
export type Action =
  | { kind: 'setComplianceState'; entityId: string; sourceRecordId: string; value: string }
  | { kind: 'triggerSync'; scope: 'device' | 'tenant'; sourceRecordId?: string }
  | { kind: 'isolateDevice'; entityId: string; sourceRecordId: string; isolate: boolean };

export interface ActionContext {
  actionId: string;
  signal: AbortSignal;
  log: Logger;
}

export type ActionResult =
  | { ok: true; vendorTraceId?: string }
  | { ok: false; reason: string; retryable: boolean };

// ---------------------------------------------------------------------------
// Connector
// ---------------------------------------------------------------------------

export interface Connector {
  /** Stable id, e.g. 'okta', 'crowdstrike-falcon'. Used as `source` on observations. */
  id: string;
  /** Semver. Recorded on every sync_run for traceability. */
  version: string;
  /** Display name shown in the UI. */
  displayName: string;
  capabilities: ConnectorCapabilities;

  /**
   * Validate credentials. Called before the first sync and on any config edit.
   * Should not be expensive; one round-trip to the vendor's "whoami" endpoint
   * is the right shape.
   */
  authenticate(config: AuthConfig): Promise<AuthResult>;

  /**
   * Yield observations. The framework writes each one and updates the run's
   * observationCount. Connectors should yield as they go rather than buffer;
   * the framework batches writes on its side.
   */
  sync(ctx: SyncContext): AsyncIterable<Observation>;

  /**
   * Present only on connectors that declare write capabilities. The framework
   * checks `capabilities.writes` before calling.
   */
  execute?(action: Action, ctx: ActionContext): Promise<ActionResult>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Type guard: does this connector declare a write capability with the given kind?
 * The framework uses this to decide whether `execute` is safe to call.
 */
export function declaresWrite(
  connector: Connector,
  kind: WriteCapability['kind'],
): boolean {
  return connector.capabilities.writes?.some((w) => w.kind === kind) ?? false;
}

/**
 * Type guard for read capabilities.
 */
export function declaresRead(
  connector: Connector,
  kind: ReadCapability['kind'],
): boolean {
  return connector.capabilities.reads.some((r) => r.kind === kind);
}
