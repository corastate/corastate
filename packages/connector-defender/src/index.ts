// Microsoft Defender connector. Skeleton-shape Week 1; real authoring Week 3.

import { defineConnector } from '@corastate/connector-sdk';
import { defenderAuth } from './auth.js';
import { defenderFetch } from './fetch.js';
import { defenderMapping } from './mapping.js';

export const defenderConnector = defineConnector({
  identity: {
    id: 'defender',
    displayName: 'Microsoft Defender for Endpoint',
    version: '0.0.1',
  },
  auth: defenderAuth,
  fetch: defenderFetch,
  mapping: defenderMapping,
});

export { defenderAuth, defenderFetch, defenderMapping };
export { mapDefenderDevice, type DefenderDevice } from './mapping.js';
