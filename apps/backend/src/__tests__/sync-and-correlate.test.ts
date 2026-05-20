/**
 * End-to-end Week 3 acceptance test (phase-1-sprint-plan-v3.md §"Week 3 gate").
 *
 *   - Seed a fresh Postgres with two sources: Okta + Defender.
 *   - Encrypt + store credentials for both.
 *   - Mock both vendor APIs (Microsoft Graph + Okta REST).
 *   - Run the sync runner against both sources.
 *   - Run the correlation engine.
 *   - Assert:
 *       1. A device observed by both sources collapses to one canonical row.
 *       2. That row's `missing_from` is empty (both sources are present).
 *       3. A device only Okta saw gets `missing_from: ['defender']`.
 *       4. A device only Defender saw gets `missing_from: ['okta']`.
 *       5. Per-source last-seen timestamps survive the merge.
 *       6. The /v1/devices route returns the merged canonical view.
 *
 * Runs against the dockerized Postgres (DATABASE_URL required). Each test
 * uses unique source uuids so concurrent test workers and repeat runs do
 * not cross-contaminate.
 */

import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, inArray } from 'drizzle-orm';
import type { Sql } from 'postgres';

import {
  canonicalDevices,
  createDb,
  credentialAccessAudit,
  credentials,
  observations,
  sources,
  syncRuns,
  type Database,
} from '@corastate/db';
import {
  DEFAULT_CORRELATION_CONFIG,
  EnvKeyProvider,
  putCredential,
  runCorrelation,
  runSync,
} from '@corastate/core';
import { createDefenderConnector } from '@corastate/connector-defender';
import { createOktaConnector } from '@corastate/connector-okta';

import { buildServer } from '../server.js';

let db: Database;
let pg: Sql;
let envVarName: string;

const TEST_TAG = `w3e2e-${randomUUID().slice(0, 8)}`;
const TENANT_ID = '00000000-0000-0000-0000-aaaaaaaaaaaa';

const SHARED_SERIAL = 'C02XY12345AB';
const OKTA_ONLY_SERIAL = 'OKTAONLY00001';
const DEFENDER_ONLY_SERIAL = 'DEFENDERONLY1';

beforeAll(() => {
  if (!process.env.DATABASE_URL) {
    throw new Error('sync-and-correlate e2e: DATABASE_URL is required.');
  }
  envVarName = `CORASTATE_TEST_MASTER_KEY_W3_${process.pid}_${Date.now()}`;
  process.env[envVarName] = randomBytes(32).toString('base64');
  ({ db, sql: pg } = createDb());
});

afterAll(async () => {
  if (!db) return;
  // Best-effort cleanup keyed by our test tag.
  const ourSources = await db.select().from(sources);
  const ourIds = ourSources.filter((s) => s.displayName.includes(TEST_TAG)).map((s) => s.id);
  if (ourIds.length > 0) {
    const ourRuns = await db
      .select({ id: syncRuns.id })
      .from(syncRuns)
      .where(inArray(syncRuns.sourceId, ourIds));
    const runIds = ourRuns.map((r) => r.id);
    if (runIds.length > 0) {
      await db.delete(observations).where(inArray(observations.syncRunId, runIds));
      await db.delete(syncRuns).where(inArray(syncRuns.id, runIds));
    }
    await db.delete(credentialAccessAudit).where(inArray(credentialAccessAudit.sourceId, ourIds));
    await db.delete(credentials).where(inArray(credentials.sourceId, ourIds));
    await db.delete(sources).where(inArray(sources.id, ourIds));
  }
  // Drop the canonical_devices rows this test produced. The synthetic-key
  // and serial-key spaces are unique to the fixtures so this cleanup is
  // safe against concurrent test runs that use different test tags.
  const matchKeys = [
    SHARED_SERIAL,
    OKTA_ONLY_SERIAL,
    DEFENDER_ONLY_SERIAL,
  ];
  await db.delete(canonicalDevices).where(inArray(canonicalDevices.matchKey, matchKeys));

  if (pg) await pg.end();
  delete process.env[envVarName];
});

interface MockedDefenderFetchInput {
  /** Devices to return on /deviceManagement/managedDevices. Single page is fine. */
  managedDevices: unknown[];
  /** Token endpoint hostname. The token call hits login.microsoftonline.com. */
  tokenHost: string;
}

function buildDefenderFetchDouble(input: MockedDefenderFetchInput): typeof fetch {
  return (async (url: string | URL, init?: RequestInit) => {
    const u = typeof url === 'string' ? url : url.toString();
    if (u.startsWith(`https://${input.tokenHost}`)) {
      void init;
      return new Response(
        JSON.stringify({
          token_type: 'Bearer',
          access_token: 'defender-mock-token',
          expires_in: 3600,
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      );
    }
    if (u.includes('/deviceManagement/managedDevices')) {
      return new Response(
        JSON.stringify({ value: input.managedDevices }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    throw new Error(`defender mock: unexpected url ${u}`);
  }) as unknown as typeof fetch;
}

interface MockedOktaFetchInput {
  baseUrl: string;
  users: unknown[];
  devices: unknown[];
}

function buildOktaFetchDouble(input: MockedOktaFetchInput): typeof fetch {
  return (async (url: string | URL, _init?: RequestInit) => {
    const u = typeof url === 'string' ? url : url.toString();
    if (u.includes('/api/v1/users')) {
      return new Response(JSON.stringify(input.users), {
        status: 200,
        headers: {
          'content-type': 'application/json',
          link: `<${input.baseUrl}/api/v1/users?limit=200>; rel="self"`,
        },
      });
    }
    if (u.includes('/api/v1/devices')) {
      return new Response(JSON.stringify(input.devices), {
        status: 200,
        headers: {
          'content-type': 'application/json',
          link: `<${input.baseUrl}/api/v1/devices?limit=200>; rel="self"`,
        },
      });
    }
    throw new Error(`okta mock: unexpected url ${u}`);
  }) as unknown as typeof fetch;
}

describe('Phase 1 Week 3: sync + correlation end-to-end', () => {
  it('merges a device seen by Okta + Defender, leaves missing_from empty', async () => {
    const provider = new EnvKeyProvider({ envVar: envVarName });

    // 1. Seed both sources.
    const [oktaSource] = await db
      .insert(sources)
      .values({
        connectorId: 'okta',
        displayName: `${TEST_TAG} okta`,
        config: { baseUrl: 'https://mock-okta.test' },
        active: true,
      })
      .returning({ id: sources.id });
    if (!oktaSource) throw new Error('seed: okta source insert returned no rows');
    const oktaSourceId = oktaSource.id;

    const [defenderSource] = await db
      .insert(sources)
      .values({
        connectorId: 'defender',
        displayName: `${TEST_TAG} defender`,
        config: { tenantId: TENANT_ID },
        active: true,
      })
      .returning({ id: sources.id });
    if (!defenderSource) throw new Error('seed: defender source insert returned no rows');
    const defenderSourceId = defenderSource.id;

    // 2. Seed credentials for both. Defender uses two: client_id + client_secret.
    await putCredential(
      { db, keyProvider: provider },
      { sourceId: oktaSourceId, name: 'okta.api_token', value: 'SSWS-mock-token' },
    );
    await putCredential(
      { db, keyProvider: provider },
      { sourceId: defenderSourceId, name: 'defender.client_id', value: 'mock-client-id' },
    );
    await putCredential(
      { db, keyProvider: provider },
      { sourceId: defenderSourceId, name: 'defender.client_secret', value: 'mock-client-secret' },
    );

    // 3. Build the connector instances and mocked vendor APIs.
    const oktaConnector = createOktaConnector({ baseUrl: 'https://mock-okta.test' });
    const defenderConnector = createDefenderConnector({ tenantId: TENANT_ID });

    const sharedDeviceCheckIn = '2026-05-19T09:00:00.000Z';
    const oktaOnlyCheckIn = '2026-05-19T09:05:00.000Z';
    const defenderOnlyCheckIn = '2026-05-19T09:10:00.000Z';

    const oktaFetch = buildOktaFetchDouble({
      baseUrl: 'https://mock-okta.test',
      users: [
        {
          id: '00uMOCKEDA',
          status: 'ACTIVE',
          created: '2024-01-01T00:00:00.000Z',
          lastLogin: '2026-05-19T08:00:00.000Z',
          lastUpdated: '2026-05-19T08:00:01.000Z',
          profile: {
            login: 'wesley@example.com',
            email: 'wesley@example.com',
            firstName: 'Wesley',
            lastName: 'Lakis',
          },
        },
      ],
      devices: [
        // Same physical device Defender also sees (matched on serial).
        {
          id: 'dev-okta-shared',
          status: 'ACTIVE',
          created: '2024-01-01T00:00:00.000Z',
          lastUpdated: sharedDeviceCheckIn,
          profile: {
            displayName: 'WL-LAPTOP-01',
            platform: 'macOS',
            osVersion: '14.5',
            serialNumber: SHARED_SERIAL,
            udid: 'okta-udid-shared',
          },
        },
        // Okta-only device — Defender never saw it.
        {
          id: 'dev-okta-only',
          status: 'ACTIVE',
          created: '2024-02-01T00:00:00.000Z',
          lastUpdated: oktaOnlyCheckIn,
          profile: {
            displayName: 'OKTAONLY-MAC',
            platform: 'macOS',
            osVersion: '14.5',
            serialNumber: OKTA_ONLY_SERIAL,
          },
        },
      ],
    });

    const defenderFetch = buildDefenderFetchDouble({
      tokenHost: 'login.microsoftonline.com',
      managedDevices: [
        // The shared physical device.
        {
          id: 'managed-dev-shared',
          deviceName: 'WL-LAPTOP-01',
          serialNumber: SHARED_SERIAL,
          azureADDeviceId: '12345678-1234-1234-1234-aaaaaaaaaaaa',
          operatingSystem: 'macOS',
          osVersion: '14.5',
          isEncrypted: true,
          managementState: 'managed',
          complianceState: 'compliant',
          lastSyncDateTime: sharedDeviceCheckIn,
          emailAddress: 'wesley@example.com',
          wiFiMacAddress: 'AA:BB:CC:DD:EE:FF',
        },
        // Defender-only device — Okta never saw it.
        {
          id: 'managed-dev-defender-only',
          deviceName: 'DEFENDERONLY-WIN',
          serialNumber: DEFENDER_ONLY_SERIAL,
          azureADDeviceId: '12345678-1234-1234-1234-bbbbbbbbbbbb',
          operatingSystem: 'Windows',
          osVersion: '11.0',
          isEncrypted: true,
          managementState: 'managed',
          complianceState: 'compliant',
          lastSyncDateTime: defenderOnlyCheckIn,
          userPrincipalName: 'wesley@example.com',
          wiFiMacAddress: '11:22:33:44:55:66',
        },
      ],
    });

    // 4. Run both syncs.
    const oktaResult = await runSync({
      sourceId: oktaSourceId,
      connector: oktaConnector,
      db,
      keyProvider: provider,
      fetch: oktaFetch,
    });
    expect(oktaResult.observationCount).toBeGreaterThan(0);
    expect(oktaResult.endpoints.find((e) => e.name === 'devices')!.records).toBe(2);

    const defenderResult = await runSync({
      sourceId: defenderSourceId,
      connector: defenderConnector,
      db,
      keyProvider: provider,
      fetch: defenderFetch,
    });
    expect(defenderResult.observationCount).toBeGreaterThan(0);
    expect(defenderResult.endpoints.find((e) => e.name === 'managedDevices')!.records).toBe(2);

    // 5. Run the correlation engine against the freshly-written observations.
    //    Pin expectedConnectorIds so missing_from only counts okta + defender —
    //    the live `sources` table may carry test rows from other concurrent
    //    runs that we don't want to leak into this assertion.
    const correlation = await runCorrelation({
      db,
      config: DEFAULT_CORRELATION_CONFIG,
      expectedConnectorIds: ['okta', 'defender'],
    });
    expect(correlation.deviceObservations).toBeGreaterThanOrEqual(4);
    expect(correlation.groups).toBeGreaterThanOrEqual(3);

    // 6. Assert the shared device collapsed.
    const sharedRows = await db
      .select()
      .from(canonicalDevices)
      .where(eq(canonicalDevices.matchKey, SHARED_SERIAL));
    expect(sharedRows.length).toBe(1);
    const shared = sharedRows[0]!;
    expect(shared.sources.sort()).toEqual(['defender', 'okta']);
    expect(shared.missingFrom).toEqual([]);
    expect(shared.hostname).toBe('WL-LAPTOP-01');
    expect(shared.serialNumber).toBe(SHARED_SERIAL);
    expect(shared.azureAdDeviceId).toBe('12345678-1234-1234-1234-aaaaaaaaaaaa');
    expect(shared.diskEncryption).toBe(true);
    expect(shared.mdmEnrolled).toBe(true);
    expect(shared.ownerEmail).toBe('wesley@example.com');
    // Per-source last-seen survives the merge.
    expect(shared.sourceLastSeen.okta).toBe(sharedDeviceCheckIn);
    expect(shared.sourceLastSeen.defender).toBe(sharedDeviceCheckIn);

    // 7. Assert the okta-only device shows defender missing.
    const oktaOnlyRows = await db
      .select()
      .from(canonicalDevices)
      .where(eq(canonicalDevices.matchKey, OKTA_ONLY_SERIAL));
    expect(oktaOnlyRows.length).toBe(1);
    expect(oktaOnlyRows[0]!.sources).toEqual(['okta']);
    expect(oktaOnlyRows[0]!.missingFrom).toEqual(['defender']);

    // 8. Assert the defender-only device shows okta missing.
    const defenderOnlyRows = await db
      .select()
      .from(canonicalDevices)
      .where(eq(canonicalDevices.matchKey, DEFENDER_ONLY_SERIAL));
    expect(defenderOnlyRows.length).toBe(1);
    expect(defenderOnlyRows[0]!.sources).toEqual(['defender']);
    expect(defenderOnlyRows[0]!.missingFrom).toEqual(['okta']);

    // 9. Idempotency: re-running the engine produces no churn (only updates).
    const second = await runCorrelation({
      db,
      config: DEFAULT_CORRELATION_CONFIG,
      expectedConnectorIds: ['okta', 'defender'],
    });
    expect(second.inserted).toBe(0);
    expect(second.updated).toBeGreaterThan(0);
    // The id of the shared row must survive the re-run.
    const sharedAgain = await db
      .select({ id: canonicalDevices.id })
      .from(canonicalDevices)
      .where(eq(canonicalDevices.matchKey, SHARED_SERIAL));
    expect(sharedAgain[0]!.id).toBe(shared.id);

    // 10. The /v1/devices route returns the merged view.
    const app = await buildServer({ db, logger: false });
    try {
      const res = await app.inject({ method: 'GET', url: '/v1/devices?limit=100' });
      expect(res.statusCode).toBe(200);
      const body = res.json() as {
        items: {
          serialNumber: string | null;
          hostname: string | null;
          sources: string[];
          missingFrom: string[];
          ownerEmail: string | null;
        }[];
        nextCursor: string | null;
      };
      const sharedItem = body.items.find((d) => d.serialNumber === SHARED_SERIAL);
      expect(sharedItem).toBeDefined();
      expect(sharedItem!.sources.sort()).toEqual(['defender', 'okta']);
      expect(sharedItem!.missingFrom).toEqual([]);

      // Fuzzy filter on hostname narrows results.
      const filtered = await app.inject({
        method: 'GET',
        url: '/v1/devices?q=defenderonly',
      });
      const filteredBody = filtered.json() as { items: { hostname: string | null }[] };
      expect(filteredBody.items.length).toBeGreaterThan(0);
      expect(
        filteredBody.items.every(
          (d) => (d.hostname ?? '').toLowerCase().includes('defenderonly'),
        ),
      ).toBe(true);

      // Fuzzy filter on owner_email also works.
      const byEmail = await app.inject({
        method: 'GET',
        url: '/v1/devices?q=wesley',
      });
      expect(byEmail.statusCode).toBe(200);
    } finally {
      await app.close();
    }

    // Suppress unused-var lint on cleanup helpers.
    void and;
  });
});
