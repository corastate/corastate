// Microsoft Defender fetch — Graph API endpoints with OData `@odata.nextLink`
// pagination. Composes the SDK's `odataNextLink` strategy by name.
//
// The Intune-Defender endpoint `/deviceManagement/managedDevices` returns
// device records under the OData `value` field. Same Graph API serves both
// Intune and Defender (they share the same MDM data model); the connector
// id stays "defender" because that's the Phase 1 product framing.

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
      itemsField: 'value',
    },
  ],
  incremental: {
    cursorField: 'lastSyncDateTime',
    paramName: '$filter',
  },
};
