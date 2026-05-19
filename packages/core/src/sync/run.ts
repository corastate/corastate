/**
 * The generic sync runner. One code path drives any connector definition
 * (architecture-v3.md §"The connector model"):
 *
 *   1. Insert a sync_runs row in status=running.
 *   2. Resolve the connector's auth strategy: decrypt every named secret
 *      through the credential store (which writes a credential_access_audit
 *      row for each decrypt), then call strategy.acquire() to produce auth
 *      material.
 *   3. For each declared endpoint, walk pages using the named pagination
 *      strategy. Each raw record runs through the connector's mapping
 *      function and is written to the observation log.
 *   4. Refresh current_state and mark the sync_run succeeded — or, on any
 *      failure, mark it failed with the error message.
 *
 * The runner never reaches into vendor specifics. All vendor-shaped logic
 * lives in the named strategies (auth, pagination) or in the connector's
 * pure mapping functions.
 */

import { eq } from 'drizzle-orm';

import {
  syncRuns,
  type Database,
  type EntityKind,
  type NewSyncRun,
} from '@corastate/db';
import type {
  AuthMaterial,
  AuthStrategy,
  Connector,
  ConnectorAuth,
  EndpointSpec,
  Logger,
  NamedStrategyRegistry,
  PaginationStrategy,
  ResolvedSecrets,
  SecretRef,
} from '@corastate/connector-sdk';
import { defaultRegistry } from '@corastate/connector-sdk';

import { getCredential } from '../secrets/credential-store.js';
import type { KeyProvider } from '../secrets/key-provider.js';
import { refreshCurrentState, writeObservation } from '../observations/write.js';

export interface RunSyncInput {
  /** Configured source uuid (sources.id). Credentials are keyed under this. */
  sourceId: string;
  /** The connector definition. */
  connector: Connector;
  /** Drizzle client. */
  db: Database;
  /** Master-key provider (env-var in Phase 1). */
  keyProvider: KeyProvider;
  /** Optional logger. Defaults to a no-op. */
  log?: Logger;
  /** Optional strategy registry override. Defaults to the SDK's defaultRegistry. */
  registry?: NamedStrategyRegistry;
  /** Optional fetch override (tests pass a mock). */
  fetch?: typeof fetch;
  /**
   * Optional sourceId override for credential lookup. Defaults to `sourceId`.
   * Some Phase-1 dev installs may store credentials under the connector id
   * directly; production multi-source installs use the configured-source uuid.
   */
  credentialSourceId?: string;
  /** Hard cap on requests per endpoint, to bound runaway pagination. Default 10_000. */
  maxRequestsPerEndpoint?: number;
}

export interface RunSyncResult {
  syncRunId: string;
  observationCount: number;
  endpoints: { name: string; pages: number; records: number; observations: number }[];
}

const NOOP_LOG: Logger = {
  trace() {},
  debug() {},
  info() {},
  warn() {},
  error() {},
};

const DEFAULT_MAX_REQUESTS_PER_ENDPOINT = 10_000;
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const MAX_HTTP_RETRIES = 5;

export async function runSync(input: RunSyncInput): Promise<RunSyncResult> {
  const log = input.log ?? NOOP_LOG;
  const registry = input.registry ?? defaultRegistry;
  const fetchImpl = input.fetch ?? globalThis.fetch;
  const credentialSourceId = input.credentialSourceId ?? input.sourceId;
  const maxPerEndpoint = input.maxRequestsPerEndpoint ?? DEFAULT_MAX_REQUESTS_PER_ENDPOINT;

  // 1. Insert the sync_runs row.
  const syncRunValues: NewSyncRun = {
    sourceId: input.sourceId,
    connectorId: input.connector.identity.id,
    connectorVersion: input.connector.identity.version,
    status: 'running',
    context: { endpoints: input.connector.fetch.endpoints.map((e) => e.name) },
  };
  const [runRow] = await input.db
    .insert(syncRuns)
    .values(syncRunValues)
    .returning({ id: syncRuns.id });
  if (!runRow) throw new Error('runSync: insert into sync_runs returned no rows');
  const syncRunId = runRow.id;

  log.info(
    {
      syncRunId,
      sourceId: input.sourceId,
      connector: input.connector.identity.id,
      version: input.connector.identity.version,
    },
    'sync started',
  );

  try {
    // 2. Resolve auth.
    const authStrategy = registry.auth.get(input.connector.auth.strategyName);
    if (!authStrategy) {
      throw new Error(
        `runSync: auth strategy '${input.connector.auth.strategyName}' not registered`,
      );
    }
    const paginationStrategy = registry.pagination.get(
      input.connector.fetch.paginationStrategyName,
    );
    if (!paginationStrategy) {
      throw new Error(
        `runSync: pagination strategy '${input.connector.fetch.paginationStrategyName}' not registered`,
      );
    }

    const resolved = await resolveSecrets({
      db: input.db,
      keyProvider: input.keyProvider,
      secretRefs: input.connector.auth.secretRefs,
      credentialSourceId,
      syncRunId,
    });

    const ac = new AbortController();
    const material = await authStrategy.acquire(input.connector.auth.params, {
      secrets: resolved,
      log,
      signal: ac.signal,
      fetch: fetchImpl,
    });

    // 3. Walk endpoints.
    let totalObservations = 0;
    const endpointStats: RunSyncResult['endpoints'] = [];
    for (const endpoint of input.connector.fetch.endpoints) {
      const stats = await runEndpoint({
        db: input.db,
        log,
        connector: input.connector,
        endpoint,
        authStrategy,
        authParams: input.connector.auth.params,
        material,
        paginationStrategy,
        paginationParams: input.connector.fetch.paginationParams,
        fetchImpl,
        syncRunId,
        resolved,
        maxRequests: maxPerEndpoint,
        signal: ac.signal,
      });
      totalObservations += stats.observations;
      endpointStats.push({ name: endpoint.name, ...stats });
    }

    // 4. Mark succeeded and refresh current_state.
    await input.db
      .update(syncRuns)
      .set({
        status: 'succeeded',
        finishedAt: new Date(),
        observationCount: totalObservations,
      })
      .where(eq(syncRuns.id, syncRunId));

    try {
      await refreshCurrentState(input.db);
    } catch (err) {
      log.warn({ err, syncRunId }, 'refreshCurrentState failed; sync still marked succeeded');
    }

    log.info(
      { syncRunId, observationCount: totalObservations, endpoints: endpointStats },
      'sync succeeded',
    );

    return { syncRunId, observationCount: totalObservations, endpoints: endpointStats };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error({ syncRunId, err }, 'sync failed');
    await input.db
      .update(syncRuns)
      .set({ status: 'failed', finishedAt: new Date(), errorMessage: message })
      .where(eq(syncRuns.id, syncRunId));
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

interface ResolveSecretsInput {
  db: Database;
  keyProvider: KeyProvider;
  secretRefs: Record<string, SecretRef>;
  credentialSourceId: string;
  syncRunId: string;
}

async function resolveSecrets(input: ResolveSecretsInput): Promise<ResolvedSecrets> {
  // The map is keyed by *logical* name (the key in secretRefs), value is the
  // decrypted plaintext. The strategy looks up by logical name through
  // ResolvedSecrets.get(ref); ref.name == logical name.
  const byLogical = new Map<string, string>();
  for (const [logical, ref] of Object.entries(input.secretRefs)) {
    const decrypted = await getCredential(
      { db: input.db, keyProvider: input.keyProvider },
      {
        sourceId: input.credentialSourceId,
        name: ref.name,
        syncRunId: input.syncRunId,
      },
    );
    byLogical.set(logical, decrypted.value);
  }
  return {
    get(ref: SecretRef): string {
      const v = byLogical.get(ref.name);
      if (v === undefined) {
        throw new Error(
          `ResolvedSecrets: no credential resolved for logical name '${ref.name}'. ` +
            'Check the connector\'s auth.secretRefs map.',
        );
      }
      return v;
    },
  };
}

interface RunEndpointInput {
  db: Database;
  log: Logger;
  connector: Connector;
  endpoint: EndpointSpec;
  authStrategy: AuthStrategy<unknown>;
  authParams: unknown;
  material: AuthMaterial;
  paginationStrategy: PaginationStrategy<unknown>;
  paginationParams: unknown;
  fetchImpl: typeof fetch;
  syncRunId: string;
  resolved: ResolvedSecrets;
  maxRequests: number;
  signal: AbortSignal;
}

interface EndpointStats {
  pages: number;
  records: number;
  observations: number;
}

async function runEndpoint(input: RunEndpointInput): Promise<EndpointStats> {
  const fetchConfig: ConnectorAuth = input.connector.auth;
  void fetchConfig; // typed reference for readers; not used at runtime here.

  let url: string = absoluteUrl(input.connector.fetch.baseUrl, input.endpoint.path);
  let params: Record<string, string> | undefined = input.endpoint.initialParams
    ? { ...input.endpoint.initialParams }
    : undefined;

  const mapping = input.endpoint.entityKind === 'identity'
    ? input.connector.mapping.identity
    : input.connector.mapping.device;
  if (!mapping) {
    throw new Error(
      `runEndpoint: connector ${input.connector.identity.id} declares endpoint ` +
        `'${input.endpoint.name}' as ${input.endpoint.entityKind}, but no mapping.${input.endpoint.entityKind} is defined.`,
    );
  }

  let pages = 0;
  let records = 0;
  let observationsWritten = 0;

  for (let i = 0; i < input.maxRequests; i += 1) {
    const requestUrl = buildUrl(url, params);
    input.log.debug(
      { endpoint: input.endpoint.name, url: requestUrl, page: pages },
      'sync: fetching page',
    );

    const response = await fetchWithRetry(input.fetchImpl, requestUrl, {
      method: 'GET',
      headers: { accept: 'application/json' },
      signal: input.signal,
    }, input.material, input.log);

    const body = await response.json().catch(() => null);
    pages += 1;

    const items = extractItems(body, input.endpoint.itemsField);
    const observedAt = new Date();
    for (const raw of items) {
      const sourceRecordId = extractId(raw, input.endpoint.idField ?? 'id');
      if (!sourceRecordId) {
        input.log.warn(
          { endpoint: input.endpoint.name, raw },
          'sync: dropping record with no id',
        );
        continue;
      }
      const partial = mapping(raw) as Record<string, unknown>;
      const written = await writeObservation(input.db, {
        source: input.connector.identity.id,
        sourceRecordId,
        entityKind: input.endpoint.entityKind as EntityKind,
        partial,
        syncRunId: input.syncRunId,
        observedAt,
      });
      observationsWritten += written;
      records += 1;
    }

    const next = input.paginationStrategy.next(
      { response, body, url: requestUrl, ...(params ? { params } : {}) },
      input.paginationParams,
    );
    if (next === null) break;
    if (next.url) url = next.url;
    params = next.params ?? undefined;
  }

  input.log.info(
    { endpoint: input.endpoint.name, pages, records, observations: observationsWritten },
    'sync: endpoint complete',
  );
  return { pages, records, observations: observationsWritten };
}

function absoluteUrl(baseUrl: string, path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  if (baseUrl.endsWith('/') && path.startsWith('/')) return baseUrl + path.slice(1);
  if (!baseUrl.endsWith('/') && !path.startsWith('/')) return `${baseUrl}/${path}`;
  return baseUrl + path;
}

function buildUrl(base: string, params: Record<string, string> | undefined): string {
  if (!params || Object.keys(params).length === 0) return base;
  const u = new URL(base);
  for (const [k, v] of Object.entries(params)) {
    u.searchParams.set(k, v);
  }
  return u.toString();
}

function extractItems(body: unknown, path: string | undefined): unknown[] {
  if (body === null || body === undefined) return [];
  if (!path) {
    if (Array.isArray(body)) return body;
    return [];
  }
  let cur: unknown = body;
  for (const segment of path.split('.')) {
    if (!cur || typeof cur !== 'object') return [];
    cur = (cur as Record<string, unknown>)[segment];
  }
  if (Array.isArray(cur)) return cur;
  return [];
}

function extractId(raw: unknown, idField: string): string | null {
  if (!raw || typeof raw !== 'object') return null;
  let cur: unknown = raw;
  for (const segment of idField.split('.')) {
    if (!cur || typeof cur !== 'object') return null;
    cur = (cur as Record<string, unknown>)[segment];
  }
  if (cur === null || cur === undefined) return null;
  return String(cur);
}

async function fetchWithRetry(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
  material: AuthMaterial,
  log: Logger,
): Promise<Response> {
  let attempt = 0;
  for (;;) {
    const withAuth = material.apply(init);
    const response = await fetchImpl(url, withAuth);
    if (response.ok) return response;
    if (!RETRYABLE_STATUS.has(response.status) || attempt >= MAX_HTTP_RETRIES) {
      const bodyText = await response.text().catch(() => '');
      throw new Error(
        `runEndpoint: GET ${url} returned ${response.status} after ${attempt + 1} attempt(s): ${bodyText.slice(0, 500)}`,
      );
    }
    const retryAfter = parseRetryAfterMs(response.headers.get('retry-after'));
    const backoff = retryAfter ?? Math.min(1000 * 2 ** attempt, 30_000);
    log.warn(
      { url, status: response.status, attempt: attempt + 1, backoffMs: backoff },
      'sync: retryable error; backing off',
    );
    await sleep(backoff);
    attempt += 1;
  }
}

function parseRetryAfterMs(header: string | null): number | null {
  if (!header) return null;
  const seconds = Number.parseInt(header, 10);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const ts = Date.parse(header);
  if (Number.isFinite(ts)) {
    const delta = ts - Date.now();
    return delta > 0 ? delta : 0;
  }
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
