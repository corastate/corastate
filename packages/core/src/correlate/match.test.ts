/**
 * Unit tests for the correlation algorithm. Driven by hand-built
 * DeviceObservation fixtures, no database. Covers the six-step match
 * priority and the merge invariants ported from Device Spotlight.
 */

import { describe, expect, it } from 'vitest';

import { buildCorrelationMap } from './match.js';
import { normalizeHostname } from './normalize.js';
import type { DeviceObservation } from './read.js';

function obs(input: Partial<DeviceObservation> & { entityId: string; source: string }): DeviceObservation {
  const base: DeviceObservation = {
    entityId: input.entityId,
    source: input.source,
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
  const merged = { ...base, ...input };
  if (input.hostname !== undefined && !input.hostnameNormalized) {
    merged.hostnameNormalized = normalizeHostname(input.hostname);
  }
  return merged;
}

describe('buildCorrelationMap', () => {
  it('groups two sources with the same serial under one key', () => {
    const { groups } = buildCorrelationMap([
      obs({ entityId: 'a', source: 'defender', serialNumber: 'ABC123', hostname: 'host1' }),
      obs({ entityId: 'b', source: 'okta', serialNumber: 'ABC123', hostname: 'host1' }),
    ]);
    expect(Array.from(groups.keys())).toEqual(['ABC123']);
    expect(groups.get('ABC123')!.length).toBe(2);
  });

  it('keeps two real-serial devices apart even if hostnames collide', () => {
    const { groups } = buildCorrelationMap([
      obs({ entityId: 'a', source: 'defender', serialNumber: 'SERIAL-A', hostname: 'shared' }),
      obs({ entityId: 'b', source: 'jamf', serialNumber: 'SERIAL-B', hostname: 'shared' }),
    ]);
    expect(groups.size).toBe(2);
    expect(groups.has('SERIAL-A')).toBe(true);
    expect(groups.has('SERIAL-B')).toBe(true);
  });

  it('matches a no-serial device by Azure AD device id', () => {
    const { groups } = buildCorrelationMap([
      obs({ entityId: 'a', source: 'defender', serialNumber: 'SERIAL-A', azureAdDeviceId: 'aad-uuid' }),
      obs({ entityId: 'b', source: 'okta', azureAdDeviceId: 'aad-uuid', hostname: 'host1' }),
    ]);
    expect(groups.size).toBe(1);
    expect(groups.get('SERIAL-A')!.length).toBe(2);
  });

  it('matches a no-serial device by unambiguous hostname', () => {
    const { groups } = buildCorrelationMap([
      obs({ entityId: 'a', source: 'defender', serialNumber: 'SERIAL-A', hostname: 'host1' }),
      obs({ entityId: 'b', source: 'okta', hostname: 'host1' }),
    ]);
    expect(groups.size).toBe(1);
    expect(groups.get('SERIAL-A')!.length).toBe(2);
  });

  it('does not match a no-serial device by ambiguous hostname', () => {
    const { groups } = buildCorrelationMap([
      obs({ entityId: 'a', source: 'defender', serialNumber: 'SERIAL-A', hostname: 'shared' }),
      obs({ entityId: 'b', source: 'jamf', serialNumber: 'SERIAL-B', hostname: 'shared' }),
      obs({ entityId: 'c', source: 'okta', hostname: 'shared' }),
    ]);
    expect(groups.size).toBe(3);
    expect(groups.has('HOSTNAME-SHARED')).toBe(true);
  });

  it('matches serial embedded in hostname at boundary', () => {
    const { groups } = buildCorrelationMap([
      obs({ entityId: 'a', source: 'defender', serialNumber: 'C02XY12345AB' }),
      obs({ entityId: 'b', source: 'okta', hostname: 'CORP-C02XY12345AB-MAC' }),
    ]);
    expect(groups.size).toBe(1);
    expect(groups.get('C02XY12345AB')!.length).toBe(2);
  });

  it('matches by unambiguous MAC address', () => {
    const { groups } = buildCorrelationMap([
      obs({ entityId: 'a', source: 'defender', serialNumber: 'SERIAL-A', macAddresses: ['AA:BB:CC:DD:EE:FF'] }),
      obs({ entityId: 'b', source: 'okta', macAddresses: ['AA:BB:CC:DD:EE:FF'], hostname: 'other' }),
    ]);
    expect(groups.size).toBe(1);
    expect(groups.get('SERIAL-A')!.length).toBe(2);
  });

  it('matches by email + hostname composite when nothing else fires', () => {
    const { groups } = buildCorrelationMap([
      obs({
        entityId: 'a',
        source: 'defender',
        serialNumber: 'SERIAL-A',
        hostname: 'shared',
        ownerEmail: 'a@example.com',
      }),
      obs({
        entityId: 'b',
        source: 'jamf',
        serialNumber: 'SERIAL-B',
        hostname: 'shared',
        ownerEmail: 'b@example.com',
      }),
      obs({
        entityId: 'c',
        source: 'okta',
        hostname: 'shared',
        ownerEmail: 'a@example.com',
      }),
    ]);
    expect(groups.get('SERIAL-A')!.length).toBe(2);
    expect(groups.get('SERIAL-B')!.length).toBe(1);
  });

  it('falls through to a synthetic key when nothing matches', () => {
    const { groups } = buildCorrelationMap([
      obs({ entityId: 'a', source: 'okta', hostname: 'standalone' }),
    ]);
    expect(Array.from(groups.keys())).toEqual(['HOSTNAME-STANDALONE']);
  });

  it('uses UNKNOWN-source-entity when neither serial nor hostname is present', () => {
    const { groups } = buildCorrelationMap([
      obs({ entityId: 'rec123', source: 'okta' }),
    ]);
    expect(Array.from(groups.keys())).toEqual(['UNKNOWN-okta-rec123']);
  });

  it('does not merge two real-serial groups via serial-in-hostname (A1)', () => {
    const { groups } = buildCorrelationMap([
      obs({ entityId: 'a', source: 'defender', serialNumber: 'C02XY12345AB', hostname: 'C02XY12345AB' }),
      // SERIAL-B happens to have a hostname that contains the other serial at a boundary.
      obs({ entityId: 'b', source: 'jamf', serialNumber: 'SERIAL-XYZ', hostname: 'C02XY12345AB-OTHER' }),
    ]);
    expect(groups.size).toBe(2);
    expect(groups.has('C02XY12345AB')).toBe(true);
    expect(groups.has('SERIAL-XYZ')).toBe(true);
  });

  it('rejects 7-character serials from the boundary match (min 8)', () => {
    const { groups } = buildCorrelationMap([
      obs({ entityId: 'a', source: 'defender', serialNumber: 'SHORT12' }),
      obs({ entityId: 'b', source: 'okta', hostname: 'PROD-SHORT12-MAC' }),
    ]);
    // Two groups: real serial alone + synthetic for the okta record.
    expect(groups.size).toBe(2);
    expect(groups.get('SHORT12')!.length).toBe(1);
  });
});
