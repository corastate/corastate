/**
 * Mapping tests for the Defender connector. The mapping is the only
 * per-vendor code in the package, so these tests carry the weight of
 * "the Defender integration is shaped right".
 */

import { describe, expect, it } from 'vitest';
import { mapDefenderDevice, type DefenderDevice } from './mapping.js';

const baseDevice: DefenderDevice = {
  id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  deviceName: 'WL-LAPTOP-01',
  serialNumber: 'c02xy12345ab',
  azureADDeviceId: '12345678-1234-1234-1234-123456789abc',
  operatingSystem: 'macOS',
  osVersion: '15.4.1',
  isEncrypted: true,
  managementState: 'managed',
  complianceState: 'compliant',
  lastSyncDateTime: '2026-05-19T10:30:00.000Z',
  emailAddress: 'Wesley.Lakis@example.com',
  userPrincipalName: 'wesley@example.com',
  userDisplayName: 'Wesley Lakis',
  wiFiMacAddress: 'a1-b2-c3-d4-e5-f6',
  ethernetMacAddress: 'a1b2c3d4e5f7',
};

describe('mapDefenderDevice', () => {
  it('uppercases the serial number', () => {
    expect(mapDefenderDevice(baseDevice).serialNumber).toBe('C02XY12345AB');
  });

  it('passes hostname through unchanged', () => {
    expect(mapDefenderDevice(baseDevice).hostname).toBe('WL-LAPTOP-01');
  });

  it('canonicalizes mac addresses across delimiter styles', () => {
    expect(mapDefenderDevice(baseDevice).macAddresses).toEqual([
      'A1:B2:C3:D4:E5:F6',
      'A1:B2:C3:D4:E5:F7',
    ]);
  });

  it('joins operating system family + version into osVersion', () => {
    expect(mapDefenderDevice(baseDevice).osVersion).toBe('macOS 15.4.1');
  });

  it('treats managementState=managed as mdmEnrolled=true', () => {
    expect(mapDefenderDevice(baseDevice).mdmEnrolled).toBe(true);
    const unmanaged: DefenderDevice = { ...baseDevice, managementState: 'discovered' };
    expect(mapDefenderDevice(unmanaged).mdmEnrolled).toBe(false);
  });

  it('parses lastSyncDateTime to a Date', () => {
    const out = mapDefenderDevice(baseDevice);
    expect(out.lastCheckIn).toBeInstanceOf(Date);
    expect(out.lastCheckIn!.toISOString()).toBe('2026-05-19T10:30:00.000Z');
  });

  it('lowercases the owner email, preferring emailAddress over UPN', () => {
    expect(mapDefenderDevice(baseDevice).ownerEmail).toBe('wesley.lakis@example.com');
  });

  it('falls back to userPrincipalName when emailAddress is missing', () => {
    const upnOnly: DefenderDevice = { ...baseDevice, emailAddress: null };
    expect(mapDefenderDevice(upnOnly).ownerEmail).toBe('wesley@example.com');
  });

  it('returns null ownerEmail when no email field is present', () => {
    const anon: DefenderDevice = { ...baseDevice, emailAddress: null, userPrincipalName: null };
    expect(mapDefenderDevice(anon).ownerEmail).toBeNull();
  });

  it('drops diskEncryption when the source reports null', () => {
    const noEnc: DefenderDevice = { ...baseDevice, isEncrypted: null };
    expect('diskEncryption' in mapDefenderDevice(noEnc)).toBe(false);
  });

  it('tags the partial as observed by defender', () => {
    expect(mapDefenderDevice(baseDevice).sources).toEqual(['defender']);
  });

  it('falls back to hardwareInformation.serialNumber when top-level serialNumber is empty', () => {
    const nested: DefenderDevice = {
      ...baseDevice,
      serialNumber: null,
      hardwareInformation: { serialNumber: 'hw-fallback' },
    };
    expect(mapDefenderDevice(nested).serialNumber).toBe('HW-FALLBACK');
  });

  it('drops malformed MAC values rather than emitting garbage', () => {
    const garbled: DefenderDevice = {
      ...baseDevice,
      wiFiMacAddress: 'not-a-mac',
      ethernetMacAddress: null,
    };
    expect(mapDefenderDevice(garbled).macAddresses).toEqual([]);
  });
});
