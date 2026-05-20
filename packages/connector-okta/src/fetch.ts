// Okta fetch + pagination piece. Composes the registry's `linkHeader` strategy
// (Okta cursors via the `Link: rel="next"` response header) and declares the
// endpoints the runner walks.
//
// baseUrl is per-tenant; the runner reads it from connector config at boot.

import type { ConnectorFetch } from '@corastate/connector-sdk';

export interface OktaLinkHeaderParams {
  /** Page size; Okta caps at 200. */
  limit: number;
}

export function oktaFetch(baseUrl: string): ConnectorFetch<OktaLinkHeaderParams> {
  return {
    baseUrl,
    paginationStrategyName: 'linkHeader',
    paginationParams: { limit: 200 },
    authPlacement: 'header',
    endpoints: [
      {
        name: 'users',
        path: '/api/v1/users',
        entityKind: 'identity',
        initialParams: { limit: '200' },
      },
      {
        name: 'devices',
        path: '/api/v1/devices',
        entityKind: 'device',
        initialParams: { limit: '200' },
      },
    ],
    incremental: {
      cursorField: 'lastUpdated',
      paramName: 'filter',
    },
  };
}
