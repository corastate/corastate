// Defender mapping piece — pure functions, one per entity kind. Real
// implementations land in Week 3 (Phase 1 sprint plan v3, §"Week 3").

import type {
  ConnectorMapping,
  MappingFn,
} from '@corastate/connector-sdk';
import type { DevicePartial } from '@corastate/contracts';

/** Subset of a Graph managedDevice the mapping cares about. */
export interface DefenderDevice {
  id: string;
  deviceName: string;
  serialNumber: string | null;
  azureADDeviceId: string | null;
  operatingSystem: string;
  osVersion: string;
  isEncrypted: boolean;
  complianceState: string;
  lastSyncDateTime: string;
}

export const mapDefenderDevice: MappingFn<DefenderDevice, DevicePartial> = (_raw) => {
  // TODO(week-3): populate from raw. Shape sketch:
  //   {
  //     hostname: raw.deviceName,
  //     serialNumber: raw.serialNumber,
  //     azureAdDeviceId: raw.azureADDeviceId,
  //     osVersion: `${raw.operatingSystem} ${raw.osVersion}`.trim(),
  //     diskEncryption: raw.isEncrypted,
  //     mdmEnrolled: true,
  //     lastCheckIn: new Date(raw.lastSyncDateTime),
  //     sources: ['defender'],
  //   }
  throw new Error('mapDefenderDevice: not implemented (Week 3)');
};

export const defenderMapping: ConnectorMapping = {
  device: mapDefenderDevice as MappingFn<unknown, DevicePartial>,
};
