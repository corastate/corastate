// CrowdStrike Falcon mapping piece. Skeleton — not authored in Phase 1.

import type {
  ConnectorMapping,
  MappingFn,
} from '@corastate/connector-sdk';
import type { DevicePartial } from '@corastate/contracts';

export interface FalconHost {
  device_id: string;
  hostname: string;
  serial_number: string | null;
  mac_address: string | null;
  os_version: string;
  last_seen: string;
}

export const mapFalconHost: MappingFn<FalconHost, DevicePartial> = (_raw) => {
  throw new Error('mapFalconHost: skeleton only — not authored in Phase 1.');
};

export const crowdstrikeMapping: ConnectorMapping = {
  device: mapFalconHost as MappingFn<unknown, DevicePartial>,
};
