// Microsoft Defender for Endpoint connector. Composes the SDK's
// `oauthClientCredentials` + `odataNextLink` strategies and supplies the
// per-vendor `managedDevice` mapping (the only per-vendor code path).
//
// Architecture-v3 §"The first connectors as code": Defender is the second
// reference connector after Okta. Both demonstrate that a connector is
// three small files plus an identity block, with all reusable behaviour
// pulled from the named-strategy registry.

import { defineConnector, type Connector } from '@corastate/connector-sdk';

import { buildDefenderAuth } from './auth.js';
import { defenderFetch } from './fetch.js';
import { defenderMapping } from './mapping.js';

export interface DefenderConnectorOptions {
  /** Azure AD tenant id (uuid). */
  tenantId: string;
  /** Override the connector version. Defaults to package version. */
  version?: string;
}

export function createDefenderConnector(options: DefenderConnectorOptions): Connector {
  return defineConnector({
    identity: {
      id: 'defender',
      displayName: 'Microsoft Defender for Endpoint',
      version: options.version ?? '0.1.0',
    },
    auth: buildDefenderAuth({ tenantId: options.tenantId }),
    fetch: defenderFetch,
    mapping: defenderMapping,
  });
}

/**
 * Default connector instance with a placeholder tenant. The worker uses
 * `createDefenderConnector` so it can thread the per-source tenant id through.
 */
export const defenderConnector = createDefenderConnector({
  tenantId: '00000000-0000-0000-0000-000000000000',
});

export { buildDefenderAuth, defenderAuth } from './auth.js';
export { defenderFetch } from './fetch.js';
export { defenderMapping, mapDefenderDevice, type DefenderDevice } from './mapping.js';
