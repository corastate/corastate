// Intune mapping piece. Skeleton — not authored in Phase 1.

import type {
  ConnectorMapping,
  MappingFn,
} from '@corastate/connector-sdk';
import type { DevicePartial } from '@corastate/contracts';

export interface IntuneDevice {
  id: string;
  deviceName: string;
  serialNumber: string | null;
  operatingSystem: string;
  osVersion: string;
  complianceState: string;
  lastSyncDateTime: string;
}

export const mapIntuneDevice: MappingFn<IntuneDevice, DevicePartial> = (_raw) => {
  throw new Error('mapIntuneDevice: skeleton only — not authored in Phase 1.');
};

export const intuneMapping: ConnectorMapping = {
  device: mapIntuneDevice as MappingFn<unknown, DevicePartial>,
};
