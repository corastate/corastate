// Intune fetch — Graph API, OData pagination via `@odata.nextLink`.

import type { ConnectorFetch } from '@corastate/connector-sdk';

export const intuneFetch: ConnectorFetch = {
  baseUrl: 'https://graph.microsoft.com/v1.0',
  paginationStrategyName: 'odataNextLink',
  paginationParams: {},
  authPlacement: 'header',
  endpoints: [
    {
      name: 'managedDevices',
      path: '/deviceManagement/managedDevices',
      entityKind: 'device',
    },
  ],
};
