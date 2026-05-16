// Jamf Pro mapping piece. Skeleton — not authored in Phase 1.

import type {
  ConnectorMapping,
  MappingFn,
} from '@corastate/connector-sdk';
import type { DevicePartial } from '@corastate/contracts';

export interface JamfComputer {
  id: string;
  general: { name: string };
  hardware: { serialNumber: string | null };
  operatingSystem: { name: string; version: string };
  diskEncryption: { individualRecoveryKeyValidityStatus: string };
}

export const mapJamfComputer: MappingFn<JamfComputer, DevicePartial> = (_raw) => {
  throw new Error('mapJamfComputer: skeleton only — not authored in Phase 1.');
};

export const jamfMapping: ConnectorMapping = {
  device: mapJamfComputer as MappingFn<unknown, DevicePartial>,
};
