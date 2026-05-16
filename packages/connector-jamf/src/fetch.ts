// Jamf Pro fetch — `/api/v1/computers-inventory`. The Pro API paginates by
// `page` + `page-size`; composes the registry's `pageNumber` strategy.

import type { ConnectorFetch } from '@corastate/connector-sdk';

export const jamfFetch: ConnectorFetch = {
  // Per-tenant baseUrl; the worker resolves before invoking the runner.
  baseUrl: 'https://{tenant}.jamfcloud.com',
  paginationStrategyName: 'pageNumber',
  paginationParams: {
    pageParamName: 'page',
    sizeParamName: 'page-size',
    pageSize: 200,
    startPage: 0,
  },
  authPlacement: 'header',
  endpoints: [
    {
      name: 'computersInventory',
      path: '/api/v1/computers-inventory',
      entityKind: 'device',
      initialParams: { section: 'GENERAL,HARDWARE,OPERATING_SYSTEM,DISK_ENCRYPTION' },
    },
  ],
};
