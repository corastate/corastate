// CrowdStrike Falcon fetch — Falcon Hosts. `/devices/queries/devices/v1`
// returns device ids; a follow-up call hydrates details. The runner walks
// the cursor through `paging.offset` per the Falcon docs; composes the
// registry's `cursorParam` strategy.

import type { ConnectorFetch } from '@corastate/connector-sdk';

export const crowdstrikeFetch: ConnectorFetch = {
  baseUrl: 'https://api.crowdstrike.com',
  paginationStrategyName: 'cursorParam',
  paginationParams: {
    cursorField: 'meta.pagination.offset',
    cursorParamName: 'offset',
    limitParamName: 'limit',
    limit: 500,
  },
  authPlacement: 'header',
  endpoints: [
    {
      name: 'devices',
      path: '/devices/queries/devices/v1',
      entityKind: 'device',
    },
  ],
};
