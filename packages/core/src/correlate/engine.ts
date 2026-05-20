/**
 * Correlation engine entry point. Reads device observations from the
 * current_state view, applies the configured match rules to collapse
 * per-source views into canonical devices, and upserts one row per group
 * into `canonical_devices`.
 *
 * Idempotent: re-running on the same observations produces the same
 * canonical rows. The natural key is `match_key` (serial when present,
 * synthetic key otherwise), and the upsert uses ON CONFLICT … DO UPDATE
 * so re-runs touch only the diff.
 *
 * The engine knows nothing about specific connectors. The list of
 * connector ids it expects to see drives `missing_from`; we read that
 * from the live `sources` table at engine-start time so adding a new
 * source doesn't require a config push.
 */

import { sql } from 'drizzle-orm';

import {
  canonicalDevices,
  sources,
  type Database,
  type NewCanonicalDevice,
} from '@corastate/db';
import type { CorrelationConfig } from '@corastate/contracts';
import type { Logger } from '@corastate/connector-sdk';

import { buildCorrelationMap } from './match.js';
import { isSyntheticKey } from './normalize.js';
import { mostRecentCheckIn, pickBestField, unionMacAddresses } from './pick.js';
import { readDeviceObservations, type DeviceObservation } from './read.js';

export interface RunCorrelationInput {
  db: Database;
  config: CorrelationConfig;
  log?: Logger;
  /**
   * Override the set of connector ids the engine expects to see across the
   * install. Defaults to "every active source's connector_id, plus every
   * connector_id that has emitted a device observation". Used by tests that
   * want to assert `missing_from` against a fixed set without depending on
   * the live `sources` table.
   */
  expectedConnectorIds?: string[];
}

export interface RunCorrelationResult {
  groups: number;
  inserted: number;
  updated: number;
  deviceObservations: number;
}

const NOOP_LOG: Logger = {
  trace() {},
  debug() {},
  info() {},
  warn() {},
  error() {},
};

export async function runCorrelation(
  input: RunCorrelationInput,
): Promise<RunCorrelationResult> {
  const log = input.log ?? NOOP_LOG;
  const observations = await readDeviceObservations(input.db);
  const expected = input.expectedConnectorIds ?? (await readExpectedConnectorIds(input.db, observations));
  const expectedSet = new Set(expected);

  log.info(
    { observationCount: observations.length, expected },
    'correlation: starting',
  );

  const { groups } = buildCorrelationMap(observations);

  let inserted = 0;
  let updated = 0;
  for (const [matchKey, members] of groups) {
    const canonical = mergeGroup(matchKey, members, input.config, expectedSet);
    const result = await upsertCanonicalDevice(input.db, canonical);
    if (result === 'inserted') inserted += 1;
    else updated += 1;
  }

  log.info(
    { groupCount: groups.size, inserted, updated },
    'correlation: complete',
  );

  return {
    groups: groups.size,
    inserted,
    updated,
    deviceObservations: observations.length,
  };
}

function mergeGroup(
  matchKey: string,
  members: DeviceObservation[],
  config: CorrelationConfig,
  expected: Set<string>,
): NewCanonicalDevice {
  const sourcesPresent = Array.from(new Set(members.map((m) => m.source))).sort();
  const missing = Array.from(expected).filter((s) => !sourcesPresent.includes(s)).sort();
  const sourceLastSeen: Record<string, string> = {};
  for (const dev of members) {
    if (!dev.lastCheckIn) continue;
    const cur = sourceLastSeen[dev.source];
    if (!cur || new Date(cur).getTime() < dev.lastCheckIn.getTime()) {
      sourceLastSeen[dev.source] = dev.lastCheckIn.toISOString();
    }
  }
  const priorityOf = (field: string): string[] => config.sourcePriority[field] ?? [];

  const pickedSerial = pickBestField<string>({
    devices: members,
    priority: priorityOf('serialNumber'),
    extract: (d) => d.serialNumber,
  });
  const pickedHostname = pickBestField<string>({
    devices: members,
    priority: priorityOf('hostname'),
    extract: (d) => d.hostname,
  });
  const pickedHardwareUuid = pickBestField<string>({
    devices: members,
    priority: priorityOf('hardwareUuid'),
    extract: (d) => d.hardwareUuid,
  });
  const pickedAzureAd = pickBestField<string>({
    devices: members,
    priority: priorityOf('azureAdDeviceId'),
    extract: (d) => d.azureAdDeviceId,
  });
  const pickedOsVersion = pickBestField<string>({
    devices: members,
    priority: priorityOf('osVersion'),
    extract: (d) => d.osVersion,
  });
  const pickedDiskEncryption = pickBestField<boolean>({
    devices: members,
    priority: priorityOf('diskEncryption'),
    extract: (d) => d.diskEncryption,
  });
  const pickedMdmEnrolled = pickBestField<boolean>({
    devices: members,
    priority: priorityOf('mdmEnrolled'),
    extract: (d) => d.mdmEnrolled,
  });
  const pickedAgentRunning = pickBestField<boolean>({
    devices: members,
    priority: priorityOf('agentRunning'),
    extract: (d) => d.agentRunning,
  });
  const pickedOwnerEmail = pickBestField<string>({
    devices: members,
    priority: priorityOf('ownerEmail'),
    extract: (d) => d.ownerEmail,
  });

  const macs = unionMacAddresses(members);
  const lastCheckIn = mostRecentCheckIn(members);

  // Real-serial groups carry their serial on the record; synthetic groups
  // pass through whatever the picked extraction returned (often null).
  const serialNumber = isSyntheticKey(matchKey) ? pickedSerial : matchKey;

  const entityIds = Array.from(new Set(members.map((m) => m.entityId)));

  return {
    matchKey,
    hostname: pickedHostname,
    serialNumber,
    hardwareUuid: pickedHardwareUuid,
    azureAdDeviceId: pickedAzureAd,
    macAddresses: macs,
    osVersion: pickedOsVersion,
    diskEncryption: pickedDiskEncryption,
    mdmEnrolled: pickedMdmEnrolled,
    agentRunning: pickedAgentRunning,
    ownerEmail: pickedOwnerEmail,
    lastCheckIn,
    sources: sourcesPresent,
    missingFrom: missing,
    sourceLastSeen,
    sourceEntityIds: entityIds,
  };
}

async function upsertCanonicalDevice(
  db: Database,
  row: NewCanonicalDevice,
): Promise<'inserted' | 'updated'> {
  // Use the unique index on match_key for ON CONFLICT. We can't easily
  // distinguish insert vs update from drizzle's onConflictDoUpdate result,
  // so look up first and decide. The match_key index keeps both calls
  // cheap (B-tree point lookups).
  const existing = await db
    .select({ id: canonicalDevices.id })
    .from(canonicalDevices)
    .where(sql`${canonicalDevices.matchKey} = ${row.matchKey}`)
    .limit(1);
  if (existing.length === 0) {
    await db.insert(canonicalDevices).values(row);
    return 'inserted';
  }
  await db
    .update(canonicalDevices)
    .set({
      hostname: row.hostname ?? null,
      serialNumber: row.serialNumber ?? null,
      hardwareUuid: row.hardwareUuid ?? null,
      azureAdDeviceId: row.azureAdDeviceId ?? null,
      macAddresses: row.macAddresses ?? [],
      osVersion: row.osVersion ?? null,
      diskEncryption: row.diskEncryption ?? null,
      mdmEnrolled: row.mdmEnrolled ?? null,
      agentRunning: row.agentRunning ?? null,
      ownerEmail: row.ownerEmail ?? null,
      lastCheckIn: row.lastCheckIn ?? null,
      sources: row.sources ?? [],
      missingFrom: row.missingFrom ?? [],
      sourceLastSeen: row.sourceLastSeen ?? {},
      sourceEntityIds: row.sourceEntityIds ?? [],
      updatedAt: new Date(),
    })
    .where(sql`${canonicalDevices.matchKey} = ${row.matchKey}`);
  return 'updated';
}

async function readExpectedConnectorIds(
  db: Database,
  observations: DeviceObservation[],
): Promise<string[]> {
  // Union of: connector ids on the active `sources` table that emit devices,
  // plus connector ids observed in the device observation set itself. The
  // observation-side union covers a source that was disabled after a sync
  // but whose canonical contribution should still survive the next
  // correlation pass.
  const observed = new Set(observations.map((o) => o.source));
  const fromSources = await db
    .select({ connectorId: sources.connectorId })
    .from(sources)
    .where(sql`${sources.active} = TRUE`);
  for (const row of fromSources) observed.add(row.connectorId);
  return Array.from(observed).sort();
}
