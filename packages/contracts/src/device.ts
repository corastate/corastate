// Canonical device record. Connectors map vendor JSON into Partial<Device>;
// the correlation engine resolves those partials into one Device per physical box.

import { z } from 'zod';

export const entityKindSchema = z
  .enum(['device', 'identity', 'agent'])
  .describe('Kind of correlated entity. Drives which table/route owns it.');

export type EntityKind = z.infer<typeof entityKindSchema>;

export const deviceSchema = z.object({
  id: z.string().uuid().describe('Corastate-internal entity id. Stable across syncs once correlated.'),
  hostname: z
    .string()
    .nullable()
    .describe('Hostname as the source reported it. Not normalized; correlation rules handle that.'),
  serialNumber: z
    .string()
    .nullable()
    .describe('Hardware serial number. Primary match key per the ported correlator.'),
  hardwareUuid: z
    .string()
    .nullable()
    .describe('Hardware UUID (SMBIOS/NVRAM). Secondary match key when serial is missing.'),
  azureAdDeviceId: z
    .string()
    .nullable()
    .describe('Azure AD device id. Match key for Entra-joined Windows endpoints.'),
  macAddresses: z
    .array(z.string())
    .describe('All MAC addresses any source has reported for this device.'),
  osVersion: z.string().nullable().describe('Operating system + version string, source-shaped.'),
  diskEncryption: z
    .boolean()
    .nullable()
    .describe('Disk encryption enabled (BitLocker on Windows, FileVault on macOS).'),
  mdmEnrolled: z.boolean().nullable().describe('Enrolled in an MDM (Intune, Jamf, etc.).'),
  agentRunning: z.boolean().nullable().describe('EDR agent is reporting in.'),
  ownerEmail: z
    .string()
    .nullable()
    .describe(
      'Best-effort owner email, picked across sources by configured priority. Null if no source observed an owner.',
    ),
  lastCheckIn: z
    .coerce.date()
    .nullable()
    .describe('Last time any source heard from the device.'),
  sources: z
    .array(z.string())
    .describe('Source ids that have observed this device (e.g. ["okta","defender"]).'),
  missingFrom: z
    .array(z.string())
    .describe(
      'Source ids that should have this device per the correlation rules but do not. The gap signal.',
    ),
  sourceLastSeen: z
    .record(z.coerce.date())
    .describe('Per-source last-seen timestamp, keyed by source id. Survives cross-source merges.'),
});

export type Device = z.infer<typeof deviceSchema>;

// Connectors return a partial — they only fill the fields the source emits.
export const devicePartialSchema = deviceSchema.partial();
export type DevicePartial = z.infer<typeof devicePartialSchema>;
