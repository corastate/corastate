/**
 * Read per-source device observations from the log. Each entity_id of
 * kind='device' corresponds to one (source, source_record_id) pair; this
 * function aggregates the latest value of each canonical attribute for
 * that entity into one record that the engine can correlate against.
 *
 * Reads the materialized `current_state` view rather than scanning the
 * full observations table. The view is REFRESHed at the end of every sync,
 * so reading from it after sync produces the canonical-projection the
 * engine needs.
 */

import { sql } from 'drizzle-orm';

import type { Database } from '@corastate/db';

import { normalizeHostname, normalizeMac, normalizeSerial } from './normalize.js';

export interface DeviceObservation {
  entityId: string;
  source: string;
  hostname: string | null;
  hostnameNormalized: string;
  serialNumber: string | null;
  hardwareUuid: string | null;
  azureAdDeviceId: string | null;
  macAddresses: string[];
  osVersion: string | null;
  diskEncryption: boolean | null;
  mdmEnrolled: boolean | null;
  agentRunning: boolean | null;
  ownerEmail: string | null;
  lastCheckIn: Date | null;
}

interface CurrentStateRow {
  entity_id: string;
  source: string;
  attribute: string;
  value: unknown;
  observed_at: string | Date;
}

export async function readDeviceObservations(db: Database): Promise<DeviceObservation[]> {
  // current_state holds DISTINCT ON (entity_id, source, attribute) so each
  // (entity_id, attribute) pair returns its most recent value. Read only
  // from the view — no join back to `observations` — so a delete in
  // `observations` (cleanup, retention) doesn't strand canonical data.
  const rows = (await db.execute(sql<CurrentStateRow>`
    SELECT
      cs.entity_id::text     AS entity_id,
      cs.source              AS source,
      cs.attribute           AS attribute,
      cs.value               AS value,
      cs.observed_at         AS observed_at
    FROM current_state cs
    JOIN entities e ON e.id = cs.entity_id
    WHERE e.kind = 'device'
  `)) as unknown as CurrentStateRow[];

  const byEntity = new Map<string, DeviceObservation>();
  for (const row of rows) {
    let dev = byEntity.get(row.entity_id);
    if (!dev) {
      dev = {
        entityId: row.entity_id,
        source: row.source,
        hostname: null,
        hostnameNormalized: '',
        serialNumber: null,
        hardwareUuid: null,
        azureAdDeviceId: null,
        macAddresses: [],
        osVersion: null,
        diskEncryption: null,
        mdmEnrolled: null,
        agentRunning: null,
        ownerEmail: null,
        lastCheckIn: null,
      };
      byEntity.set(row.entity_id, dev);
    }
    applyAttribute(dev, row.attribute, row.value);
  }
  for (const dev of byEntity.values()) {
    dev.hostnameNormalized = normalizeHostname(dev.hostname);
  }
  return Array.from(byEntity.values());
}

function applyAttribute(dev: DeviceObservation, attribute: string, value: unknown): void {
  switch (attribute) {
    case 'hostname':
      dev.hostname = stringOrNull(value);
      return;
    case 'serialNumber':
      dev.serialNumber = normalizeSerial(stringOrNull(value));
      return;
    case 'hardwareUuid':
      dev.hardwareUuid = stringOrNull(value);
      return;
    case 'azureAdDeviceId': {
      const v = stringOrNull(value);
      dev.azureAdDeviceId = v ? v.toLowerCase() : null;
      return;
    }
    case 'macAddresses': {
      const arr = arrayOfStrings(value);
      const normalized: string[] = [];
      const seen = new Set<string>();
      for (const m of arr) {
        const n = normalizeMac(m);
        if (n && !seen.has(n)) {
          seen.add(n);
          normalized.push(n);
        }
      }
      dev.macAddresses = normalized;
      return;
    }
    case 'osVersion':
      dev.osVersion = stringOrNull(value);
      return;
    case 'diskEncryption':
      dev.diskEncryption = boolOrNull(value);
      return;
    case 'mdmEnrolled':
      dev.mdmEnrolled = boolOrNull(value);
      return;
    case 'agentRunning':
      dev.agentRunning = boolOrNull(value);
      return;
    case 'ownerEmail': {
      const v = stringOrNull(value);
      dev.ownerEmail = v ? v.toLowerCase() : null;
      return;
    }
    case 'lastCheckIn':
      dev.lastCheckIn = dateOrNull(value);
      return;
    default:
      // Unknown attribute — ignore. The mapping layer is free to emit
      // extras (vendor-specific fields); the canonical projection drops
      // anything not on the device schema.
      return;
  }
}

function stringOrNull(value: unknown): string | null {
  if (typeof value === 'string') return value.length > 0 ? value : null;
  return null;
}

function arrayOfStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string');
}

function boolOrNull(value: unknown): boolean | null {
  if (value === true || value === false) return value;
  return null;
}

function dateOrNull(value: unknown): Date | null {
  if (value instanceof Date) return value;
  if (typeof value === 'string') {
    const d = new Date(value);
    return Number.isFinite(d.getTime()) ? d : null;
  }
  if (typeof value === 'number') {
    const d = new Date(value);
    return Number.isFinite(d.getTime()) ? d : null;
  }
  return null;
}
