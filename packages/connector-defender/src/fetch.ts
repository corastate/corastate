// Microsoft Defender fetch — Graph API endpoints, OData `@odata.nextLink`
// pagination. Composes the registry's `odataNextLink` strategy.

import type { ConnectorFetch } from '@corastate/connector-sdk';

export const defenderFetch: ConnectorFetch = {
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
