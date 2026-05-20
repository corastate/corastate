/**
 * `corastate seed`
 *
 * Loads realistic-looking demo data into the local database so the web UI
 * has something to show without anyone connecting a real Okta or Defender
 * tenant. The 30-minute walkthrough in the README routes through this
 * command (phase-1-sprint-plan-v3.md §"Week 4").
 *
 * What it writes:
 *   - Two sources rows ("Okta (demo)" + "Defender (demo)"), marked inactive
 *     so the worker doesn't try to poll them with the fake config.
 *   - One sync_runs row per source, status=succeeded.
 *   - Observations for ~30 devices, with overlap between the two sources so
 *     the correlation engine has cross-source matches to work with.
 *   - Observations for ~20 identities (Okta side only — Defender doesn't
 *     emit identities in the real connector).
 *   - The current_state materialized view is refreshed.
 *   - The correlation engine runs over the new observations, populating
 *     canonical_devices.
 *
 * The command is idempotent at the source level: re-running won't double up
 * sources rows because we look up by display name. Observations are
 * append-only, so re-running adds another sync's worth of identical data
 * (and the correlation engine collapses it back into the same canonical
 * devices). For a clean re-seed, drop the postgres volume.
 */

import { randomUUID } from 'node:crypto';

import { eq, sql } from 'drizzle-orm';
import pino from 'pino';
import type { Command } from 'commander';

import {
  createDb,
  entities,
  observations,
  sources,
  syncRuns,
  type NewObservation,
  type NewSource,
  type NewSyncRun,
} from '@corastate/db';
import {
  loadCorrelationConfig,
  refreshCurrentState,
  runCorrelation,
} from '@corastate/core';
import type { DevicePartial, IdentityPartial } from '@corastate/contracts';

interface DemoDevice {
  hostname: string;
  serialNumber: string;
  ownerEmail: string;
  os: 'macOS' | 'Windows 11' | 'Windows 10';
  diskEncryption: boolean;
  /** Which demo sources have observed this device. */
  presentIn: ('okta-demo' | 'defender-demo')[];
}

interface DemoIdentity {
  email: string;
  displayName: string;
  status: 'active' | 'suspended' | 'deactivated';
  lastLoginDaysAgo: number;
}

const FIRST_NAMES = [
  'Avery', 'Blake', 'Casey', 'Dana', 'Emery', 'Finley', 'Gabe', 'Harper',
  'Indie', 'Jordan', 'Kendall', 'Logan', 'Morgan', 'Noa', 'Ollie', 'Parker',
  'Quinn', 'Riley', 'Sage', 'Tatum',
];
const LAST_NAMES = [
  'Brooks', 'Carter', 'Diaz', 'Ellis', 'Flores', 'Garcia', 'Hayes', 'Iwasa',
  'Jensen', 'Khan', 'Liu', 'Mendez', 'Novak', 'Okafor', 'Patel', 'Quinn',
  'Reyes', 'Singh', 'Tran', 'Ueno',
];

function buildDemoIdentities(): DemoIdentity[] {
  return FIRST_NAMES.map((first, i): DemoIdentity => {
    const last = LAST_NAMES[i % LAST_NAMES.length]!;
    const status: DemoIdentity['status'] =
      i === 5 ? 'suspended' : i === 11 ? 'deactivated' : 'active';
    return {
      email: `${first.toLowerCase()}.${last.toLowerCase()}@acme.example`,
      displayName: `${first} ${last}`,
      status,
      lastLoginDaysAgo: status === 'active' ? (i % 5) : 90 + i,
    };
  });
}

function buildDemoDevices(identities: DemoIdentity[]): DemoDevice[] {
  // 30 devices for 20 identities. Some identities own more than one device,
  // some own zero — the correlator should reflect both.
  const devices: DemoDevice[] = [];
  for (let i = 0; i < 30; i += 1) {
    const owner = identities[i % identities.length]!;
    const os: DemoDevice['os'] = i % 3 === 0 ? 'macOS' : i % 3 === 1 ? 'Windows 11' : 'Windows 10';
    const hostname = `${owner.email.split('@')[0]}-${i % 3 === 0 ? 'mac' : 'pc'}-${(i + 1).toString().padStart(2, '0')}`;
    const serial = `SN${(1_000_000 + i).toString()}`;
    // Source-presence mix designed to give the correlation engine something
    // interesting to do:
    //   indices 0–17: both Okta and Defender → "complete"
    //   indices 18–23: Defender only → no owner from Okta, missing-from contains 'okta-demo'
    //   indices 24–29: Okta only → missing-from contains 'defender-demo' (the gap signal)
    let presentIn: DemoDevice['presentIn'];
    if (i < 18) presentIn = ['okta-demo', 'defender-demo'];
    else if (i < 24) presentIn = ['defender-demo'];
    else presentIn = ['okta-demo'];
    devices.push({
      hostname,
      serialNumber: serial,
      ownerEmail: owner.email,
      os,
      diskEncryption: i % 7 !== 0, // mostly true, a few false to show the warning state
      presentIn,
    });
  }
  return devices;
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

interface SourceRow {
  id: string;
  connectorId: string;
  displayName: string;
}

/**
 * Upsert the two demo sources by display name. Returns the rows with their
 * (possibly pre-existing) UUIDs so observations can reference them.
 */
async function ensureSources(db: ReturnType<typeof createDb>['db']): Promise<{
  okta: SourceRow;
  defender: SourceRow;
}> {
  const wanted: NewSource[] = [
    {
      connectorId: 'okta-demo',
      displayName: 'Okta (demo)',
      config: { demo: true },
      active: false,
    },
    {
      connectorId: 'defender-demo',
      displayName: 'Defender (demo)',
      config: { demo: true },
      active: false,
    },
  ];
  const out: SourceRow[] = [];
  for (const w of wanted) {
    const existing = await db
      .select({ id: sources.id, connectorId: sources.connectorId, displayName: sources.displayName })
      .from(sources)
      .where(eq(sources.displayName, w.displayName))
      .limit(1);
    if (existing[0]) {
      out.push(existing[0]);
      continue;
    }
    const [row] = await db
      .insert(sources)
      .values(w)
      .returning({
        id: sources.id,
        connectorId: sources.connectorId,
        displayName: sources.displayName,
      });
    if (!row) throw new Error('seed: insert into sources returned no rows');
    out.push(row);
  }
  return { okta: out[0]!, defender: out[1]! };
}

async function insertSyncRun(
  db: ReturnType<typeof createDb>['db'],
  sourceId: string,
  connectorId: string,
): Promise<string> {
  const now = new Date();
  const values: NewSyncRun = {
    sourceId,
    connectorId,
    connectorVersion: '0.0.0-demo',
    status: 'succeeded',
    startedAt: new Date(now.getTime() - 30_000),
    finishedAt: now,
    observationCount: 0,
    context: { demo: true },
  };
  const [row] = await db
    .insert(syncRuns)
    .values(values)
    .returning({ id: syncRuns.id });
  if (!row) throw new Error('seed: insert into sync_runs returned no rows');
  return row.id;
}

/**
 * Convert a canonical partial into one observation row per defined field.
 * Mirrors writeObservation() in core, but takes the entity id explicitly so
 * the seeder can plant matched IDs by source-record-id (= serial number for
 * devices, email for identities).
 */
function toObservationRows(input: {
  partial: Record<string, unknown>;
  source: string;
  sourceRecordId: string;
  entityKind: 'device' | 'identity';
  entityId: string;
  syncRunId: string;
  observedAt: Date;
}): NewObservation[] {
  const rows: NewObservation[] = [];
  for (const [attribute, value] of Object.entries(input.partial)) {
    if (value === undefined || value === null) continue;
    if (attribute === 'id') continue;
    rows.push({
      observedAt: input.observedAt,
      source: input.source,
      sourceRecordId: input.sourceRecordId,
      entityKind: input.entityKind,
      entityId: input.entityId,
      attribute,
      value: value as NewObservation['value'],
      syncRunId: input.syncRunId,
    });
  }
  return rows;
}

async function writeBatched(
  db: ReturnType<typeof createDb>['db'],
  rows: NewObservation[],
  batchSize = 200,
): Promise<void> {
  for (let i = 0; i < rows.length; i += batchSize) {
    await db.insert(observations).values(rows.slice(i, i + batchSize));
  }
}

/**
 * Pre-create entities rows so observations can share an entity_id between
 * the two sources (Okta + Defender). Otherwise the per-source entity logic
 * in resolveEntityId would mint two rows and the correlator would have to
 * stitch them back together via match keys.
 *
 * For demo data we already know which records correlate — give them the
 * same entity_id from the start. The correlator still runs and produces
 * canonical_devices; it just doesn't have to discover the matches.
 */
async function mintEntities(
  db: ReturnType<typeof createDb>['db'],
  kind: 'device' | 'identity',
  count: number,
): Promise<string[]> {
  if (count === 0) return [];
  const values = Array.from({ length: count }, () => ({ id: randomUUID(), kind }));
  const rows = await db.insert(entities).values(values).returning({ id: entities.id });
  if (rows.length !== count) {
    throw new Error(`seed: mintEntities expected ${count} rows, got ${rows.length}`);
  }
  return rows.map((r) => r.id);
}

export function registerSeed(program: Command): void {
  program
    .command('seed')
    .description('Load demo data so the UI has correlated devices and identities to show')
    .option('--reset', 'Truncate observations + entities + canonical_devices first for a clean re-seed')
    .action(async (opts: { reset?: boolean }) => {
      const log = pino({
        name: 'seed',
        level: process.env.LOG_LEVEL ?? 'info',
        transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss.l' } },
      });

      const { db, sql: pg } = createDb();
      try {
        if (opts.reset) {
          log.warn('reset flag set — truncating observations / entities / canonical_devices / sources / sync_runs');
          await db.execute(sql`TRUNCATE TABLE observations`);
          await db.execute(sql`TRUNCATE TABLE canonical_devices`);
          await db.execute(sql`TRUNCATE TABLE sync_runs CASCADE`);
          await db.execute(sql`TRUNCATE TABLE entities CASCADE`);
          await db.execute(sql`TRUNCATE TABLE sources CASCADE`);
        }

        log.info('ensuring demo sources');
        const { okta, defender } = await ensureSources(db);

        log.info('opening sync_runs rows for the demo sources');
        const oktaRunId = await insertSyncRun(db, okta.id, okta.connectorId);
        const defenderRunId = await insertSyncRun(db, defender.id, defender.connectorId);

        const identities = buildDemoIdentities();
        const devices = buildDemoDevices(identities);

        log.info(
          { identityCount: identities.length, deviceCount: devices.length },
          'minting entities + observations',
        );

        // Identities — Okta only (Defender doesn't emit identities). One
        // entity per identity.
        const identityEntityIds = await mintEntities(db, 'identity', identities.length);

        const now = new Date();
        const rows: NewObservation[] = [];

        identities.forEach((identity, i) => {
          const partial: IdentityPartial = {
            email: identity.email,
            displayName: identity.displayName,
            status: identity.status,
            lastLogin: daysAgo(identity.lastLoginDaysAgo),
            sources: ['okta-demo'],
            vendorIds: { 'okta-demo': `00u${(100000 + i).toString()}` },
          };
          rows.push(
            ...toObservationRows({
              partial: partial as Record<string, unknown>,
              source: 'okta-demo',
              sourceRecordId: identity.email,
              entityKind: 'identity',
              entityId: identityEntityIds[i]!,
              syncRunId: oktaRunId,
              observedAt: now,
            }),
          );
        });

        // Devices — one entity per (device, source) pair. This mirrors the
        // real sync flow: each connector mints its own entity row via
        // resolveEntityId(source, source_record_id), and the correlation
        // engine collapses cross-source pairs into one canonical_devices
        // row via the configured match keys (serial number first).
        const okta18 = devices.filter((d) => d.presentIn.includes('okta-demo')).length;
        const defender24 = devices.filter((d) => d.presentIn.includes('defender-demo')).length;
        const oktaDeviceEntityIds = await mintEntities(db, 'device', okta18);
        const defenderDeviceEntityIds = await mintEntities(db, 'device', defender24);

        let oktaCursor = 0;
        let defenderCursor = 0;
        devices.forEach((device, i) => {
          if (device.presentIn.includes('okta-demo')) {
            const entityId = oktaDeviceEntityIds[oktaCursor]!;
            oktaCursor += 1;
            const partial: DevicePartial = {
              hostname: device.hostname,
              serialNumber: device.serialNumber,
              osVersion: device.os,
              ownerEmail: device.ownerEmail,
              lastCheckIn: daysAgo(i % 5),
              sources: ['okta-demo'],
              macAddresses: [],
              sourceLastSeen: { 'okta-demo': daysAgo(i % 5) },
            };
            rows.push(
              ...toObservationRows({
                partial: partial as Record<string, unknown>,
                source: 'okta-demo',
                sourceRecordId: `okta-${device.serialNumber}`,
                entityKind: 'device',
                entityId,
                syncRunId: oktaRunId,
                observedAt: now,
              }),
            );
          }
          if (device.presentIn.includes('defender-demo')) {
            const entityId = defenderDeviceEntityIds[defenderCursor]!;
            defenderCursor += 1;
            const partial: DevicePartial = {
              hostname: device.hostname,
              serialNumber: device.serialNumber,
              osVersion: device.os,
              diskEncryption: device.diskEncryption,
              mdmEnrolled: true,
              agentRunning: true,
              lastCheckIn: daysAgo(i % 3),
              sources: ['defender-demo'],
              macAddresses: [`02:00:5e:00:53:${(i + 1).toString(16).padStart(2, '0')}`],
              sourceLastSeen: { 'defender-demo': daysAgo(i % 3) },
            };
            rows.push(
              ...toObservationRows({
                partial: partial as Record<string, unknown>,
                source: 'defender-demo',
                sourceRecordId: `defender-${device.serialNumber}`,
                entityKind: 'device',
                entityId,
                syncRunId: defenderRunId,
                observedAt: now,
              }),
            );
          }
        });

        log.info({ observationCount: rows.length }, 'writing observations');
        await writeBatched(db, rows);

        // Update observation_count on the sync_runs rows so the /v1/sources
        // view reads the right numbers.
        const oktaCount = rows.filter((r) => r.syncRunId === oktaRunId).length;
        const defenderCount = rows.filter((r) => r.syncRunId === defenderRunId).length;
        await db.execute(
          sql`UPDATE sync_runs SET observation_count = ${oktaCount} WHERE id = ${oktaRunId}::uuid`,
        );
        await db.execute(
          sql`UPDATE sync_runs SET observation_count = ${defenderCount} WHERE id = ${defenderRunId}::uuid`,
        );

        log.info('refreshing current_state materialized view');
        await refreshCurrentState(db);

        log.info('running correlation engine');
        const config = await loadCorrelationConfig();
        const result = await runCorrelation({ db, config, log });
        log.info({ result }, 'correlation complete');

        log.info(
          {
            identities: identities.length,
            devices: devices.length,
            observations: rows.length,
          },
          'seed complete — open http://localhost:5173 to browse the data',
        );
      } finally {
        await pg.end();
      }
    });
}
