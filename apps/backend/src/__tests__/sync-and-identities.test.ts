/**
 * End-to-end Week 2 acceptance test (phase-1-sprint-plan-v3.md §"Week 2 gate"):
 *   - Seed a fake Okta credential.
 *   - Mock the Okta API with a fetch double.
 *   - Run the sync runner.
 *   - Assert observations were written and the credential decrypt was audited.
 *   - Boot the Fastify app and assert /v1/sources lists the source and
 *     /v1/identities returns the synced users.
 *
 * Runs against the dockerized Postgres (DATABASE_URL required). Each test
 * uses a unique source uuid + connector id so concurrent test workers and
 * repeat runs don't cross-contaminate.
 */

import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, and } from 'drizzle-orm';
import type { Sql } from 'postgres';

import {
  createDb,
  credentialAccessAudit,
  credentials,
  entities,
  keyVersions,
  observations,
  sources,
  syncRuns,
  type Database,
} from '@corastate/db';
import {
  EnvKeyProvider,
  putCredential,
  runSync,
} from '@corastate/core';
import { createOktaConnector } from '@corastate/connector-okta';

import { buildServer } from '../server.js';

let db: Database;
let pg: Sql;
let envVarName: string;

const TEST_CONNECTOR_ID = `okta-test-${randomUUID().slice(0, 8)}`;
const SOURCE_TEST_TAG = `e2e-${randomUUID().slice(0, 8)}`;

beforeAll(() => {
  if (!process.env.DATABASE_URL) {
    throw new Error('sync-and-identities e2e: DATABASE_URL is required.');
  }
  envVarName = `CORASTATE_TEST_MASTER_KEY_${process.pid}_${Date.now()}`;
  process.env[envVarName] = randomBytes(32).toString('base64');
  ({ db, sql: pg } = createDb());
});

afterAll(async () => {
  if (!db) return;
  // Clean every row we created. The order respects FK-free relationships
  // (observations references sync_runs.sync_run_id by value, not FK).
  const ourRuns = await db
    .select({ id: syncRuns.id, sourceId: syncRuns.sourceId })
    .from(syncRuns)
    .where(eq(syncRuns.connectorId, 'okta'));
  for (const run of ourRuns) {
    if (!run.sourceId) continue;
    const src = await db.select().from(sources).where(eq(sources.id, run.sourceId));
    if (src.length === 0) continue;
    if (!src[0]!.displayName.includes(SOURCE_TEST_TAG)) continue;
    await db.delete(observations).where(eq(observations.syncRunId, run.id));
    await db.delete(syncRuns).where(eq(syncRuns.id, run.id));
  }
  const ourSources = await db.select().from(sources);
  for (const s of ourSources) {
    if (!s.displayName.includes(SOURCE_TEST_TAG)) continue;
    // Clean entities created during this source's syncs.
    await db.delete(observations).where(eq(observations.source, 'okta'));
    // Clean credentials + audits keyed by this source's id (text-stringified).
    await db
      .delete(credentialAccessAudit)
      .where(eq(credentialAccessAudit.sourceId, s.id));
    await db.delete(credentials).where(eq(credentials.sourceId, s.id));
    await db.delete(sources).where(eq(sources.id, s.id));
  }
  // Entities created by tests are best-effort cleaned via cascading the
  // observations.source='okta' delete above; a stray entities row is
  // harmless across runs because each test uses a unique source uuid.
  if (pg) await pg.end();
  delete process.env[envVarName];
  void keyVersions;
  void entities;
  void TEST_CONNECTOR_ID;
});

interface MockedFetchInput {
  baseUrl: string;
  pageOne: unknown[];
  pageTwo: unknown[];
}

/**
 * Build a fetch double that mimics Okta's /api/v1/users two-page response.
 * Page one carries a `rel="next"` Link; page two carries only `rel="self"`.
 */
function buildOktaFetchDouble(input: MockedFetchInput): typeof fetch {
  return (async (url: string | URL, _init?: RequestInit) => {
    const u = typeof url === 'string' ? url : url.toString();
    const seen = new URL(u);
    const after = seen.searchParams.get('after');
    if (!after) {
      const linkHeader =
        `<${input.baseUrl}/api/v1/users?after=cursor-2&limit=200>; rel="next", ` +
        `<${input.baseUrl}/api/v1/users?limit=200>; rel="self"`;
      return new Response(JSON.stringify(input.pageOne), {
        status: 200,
        headers: {
          'content-type': 'application/json',
          link: linkHeader,
        },
      });
    }
    return new Response(JSON.stringify(input.pageTwo), {
      status: 200,
      headers: {
        'content-type': 'application/json',
        link: `<${input.baseUrl}/api/v1/users?limit=200>; rel="self"`,
      },
    });
  }) as unknown as typeof fetch;
}

describe('Phase 1 Week 2: sync runner end-to-end', () => {
  it('syncs Okta users into observations and surfaces them via /v1', async () => {
    const provider = new EnvKeyProvider({ envVar: envVarName });

    // 1. Insert a configured source row.
    const [sourceRow] = await db
      .insert(sources)
      .values({
        connectorId: 'okta',
        displayName: `${SOURCE_TEST_TAG} okta`,
        config: { baseUrl: 'https://mock.okta.test' },
        active: true,
      })
      .returning({ id: sources.id });
    if (!sourceRow) throw new Error('seed: insert sources returned no rows');
    const sourceId = sourceRow.id;

    // 2. Encrypt + store the API token under (sourceId, 'okta.api_token').
    await putCredential(
      { db, keyProvider: provider },
      {
        sourceId,
        name: 'okta.api_token',
        value: 'SSWS-token-xyz',
      },
    );

    // 3. Run the sync runner with a mocked Okta API.
    const connector = createOktaConnector({ baseUrl: 'https://mock.okta.test' });
    const fetchDouble = buildOktaFetchDouble({
      baseUrl: 'https://mock.okta.test',
      pageOne: [
        {
          id: '00uPAGE1A',
          status: 'ACTIVE',
          created: '2024-01-01T00:00:00.000Z',
          lastLogin: '2026-05-18T11:00:00.000Z',
          lastUpdated: '2026-05-18T11:00:01.000Z',
          profile: {
            login: 'alice@example.com',
            email: 'Alice@example.com',
            firstName: 'Alice',
            lastName: 'Smith',
            title: 'Engineer',
            department: 'Platform',
          },
        },
      ],
      pageTwo: [
        {
          id: '00uPAGE2B',
          status: 'SUSPENDED',
          created: '2024-02-01T00:00:00.000Z',
          lastLogin: null,
          lastUpdated: '2026-05-18T11:30:01.000Z',
          profile: {
            login: 'bob@example.com',
            email: 'bob@example.com',
            firstName: 'Bob',
            lastName: 'Jones',
          },
        },
      ],
    });

    const result = await runSync({
      sourceId,
      connector,
      db,
      keyProvider: provider,
      fetch: fetchDouble,
    });

    expect(result.observationCount).toBeGreaterThan(0);
    expect(result.endpoints[0]!.pages).toBe(2);
    expect(result.endpoints[0]!.records).toBe(2);

    // 4. sync_runs row is succeeded.
    const [run] = await db.select().from(syncRuns).where(eq(syncRuns.id, result.syncRunId));
    expect(run).toBeDefined();
    expect(run!.status).toBe('succeeded');
    expect(run!.sourceId).toBe(sourceId);
    expect(run!.observationCount).toBe(result.observationCount);

    // 5. Observations landed under source='okta' with the new sync_run_id.
    const obs = await db
      .select()
      .from(observations)
      .where(
        and(eq(observations.source, 'okta'), eq(observations.syncRunId, result.syncRunId)),
      );
    expect(obs.length).toBeGreaterThan(0);
    const emails = obs.filter((o) => o.attribute === 'email').map((o) => o.value);
    expect(emails).toContainEqual('alice@example.com');
    expect(emails).toContainEqual('bob@example.com');

    // 6. The credential decrypt was audited for this sync_run_id.
    const audits = await db
      .select()
      .from(credentialAccessAudit)
      .where(eq(credentialAccessAudit.syncRunId, result.syncRunId));
    expect(audits.length).toBeGreaterThan(0);
    expect(audits.some((a) => a.action === 'decrypt' && a.succeeded)).toBe(true);

    // 7. Boot Fastify against the same db and assert /v1/sources + /v1/identities.
    const app = await buildServer({ db, logger: false });
    try {
      const sourcesRes = await app.inject({ method: 'GET', url: '/v1/sources' });
      expect(sourcesRes.statusCode).toBe(200);
      const sourcesBody = sourcesRes.json() as {
        items: { id: string; name: string; type: string; status: string; lastSyncedAt: string | null }[];
        total: number;
      };
      const ours = sourcesBody.items.find((s) => s.id === sourceId);
      expect(ours).toBeDefined();
      expect(ours!.type).toBe('okta');
      expect(ours!.status).toBe('succeeded');
      expect(ours!.lastSyncedAt).not.toBeNull();

      const idsRes = await app.inject({ method: 'GET', url: '/v1/identities' });
      expect(idsRes.statusCode).toBe(200);
      const idsBody = idsRes.json() as {
        items: { email: string; displayName: string | null; status: string }[];
        nextCursor: string | null;
      };
      const found = idsBody.items.find((i) => i.email === 'alice@example.com');
      expect(found).toBeDefined();
      expect(found!.displayName).toBe('Alice Smith');
      expect(found!.status).toBe('active');

      // Fuzzy filter narrows results.
      const filtered = await app.inject({ method: 'GET', url: '/v1/identities?q=alice' });
      const filteredBody = filtered.json() as { items: { email: string }[] };
      expect(filteredBody.items.every((i) => i.email.includes('alice'))).toBe(true);
    } finally {
      await app.close();
    }
  });
});
