// Defender mapping — pure functions, one per entity kind. Maps the
// Microsoft Graph `managedDevice` payload into Corastate's canonical
// DevicePartial shape.
//
// Field reference:
//   https://learn.microsoft.com/en-us/graph/api/resources/intune-devices-manageddevice
//
// The mapping types only the fields we project. Graph's payload is wide; we
// deliberately ignore the long tail so a new optional field upstream does
// not ripple into a TypeScript change here.

import type {
  ConnectorMapping,
  MappingFn,
} from '@corastate/connector-sdk';
import type { DevicePartial } from '@corastate/contracts';

export interface DefenderDevice {
  id: string;
  deviceName?: string | null;
  serialNumber?: string | null;
  azureADDeviceId?: string | null;
  operatingSystem?: string | null;
  osVersion?: string | null;
  isEncrypted?: boolean | null;
  managementState?: string | null;
  complianceState?: string | null;
  lastSyncDateTime?: string | null;
  emailAddress?: string | null;
  userPrincipalName?: string | null;
  userDisplayName?: string | null;
  wiFiMacAddress?: string | null;
  ethernetMacAddress?: string | null;
  hardwareInformation?: {
    serialNumber?: string | null;
    wifiMac?: string | null;
  } | null;
}

function normalizeMac(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw.toUpperCase().replace(/[-.:]/g, '');
  if (cleaned.length !== 12 || /[^0-9A-F]/.test(cleaned)) return null;
  return cleaned.match(/.{2}/g)!.join(':');
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d : null;
}

function joinOs(family: string | null | undefined, version: string | null | undefined): string | null {
  const parts = [family, version].filter((p): p is string => typeof p === 'string' && p.length > 0);
  if (parts.length === 0) return null;
  return parts.join(' ').trim();
}

function nonEmpty(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function dedupe(values: (string | null)[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of values) {
    if (v === null) continue;
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

/**
 * Defender's `isEncrypted` is reported on most Windows endpoints but is null
 * for some macOS/iOS rows. Treat the null case as "not observed" by leaving
 * the canonical field undefined (the runner drops undefined fields rather
 * than writing a NULL observation).
 */
function diskEncryptionOr(raw: boolean | null | undefined): boolean | undefined {
  if (raw === true || raw === false) return raw;
  return undefined;
}

function ownerEmailOf(raw: DefenderDevice): string | null {
  const candidate = nonEmpty(raw.emailAddress) ?? nonEmpty(raw.userPrincipalName);
  if (!candidate) return null;
  return candidate.toLowerCase();
}

export const mapDefenderDevice: MappingFn<DefenderDevice, DevicePartial> = (raw) => {
  const macs = dedupe([
    normalizeMac(raw.wiFiMacAddress),
    normalizeMac(raw.ethernetMacAddress),
    normalizeMac(raw.hardwareInformation?.wifiMac),
  ]);
  const serialRaw = nonEmpty(raw.serialNumber) ?? nonEmpty(raw.hardwareInformation?.serialNumber);
  const serial = serialRaw ? serialRaw.toUpperCase() : null;
  const partial: DevicePartial = {
    hostname: nonEmpty(raw.deviceName),
    serialNumber: serial,
    azureAdDeviceId: nonEmpty(raw.azureADDeviceId),
    macAddresses: macs,
    osVersion: joinOs(raw.operatingSystem, raw.osVersion),
    mdmEnrolled: raw.managementState === 'managed',
    lastCheckIn: parseDate(raw.lastSyncDateTime),
    sources: ['defender'],
    ownerEmail: ownerEmailOf(raw),
  };
  const enc = diskEncryptionOr(raw.isEncrypted);
  if (enc !== undefined) partial.diskEncryption = enc;
  return partial;
};

export const defenderMapping: ConnectorMapping = {
  device: mapDefenderDevice as MappingFn<unknown, DevicePartial>,
};
