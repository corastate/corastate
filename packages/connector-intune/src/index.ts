// Microsoft Intune connector. Scaffolded skeleton; not authored in Phase 1.

import { defineConnector } from '@corastate/connector-sdk';
import { intuneAuth } from './auth.js';
import { intuneFetch } from './fetch.js';
import { intuneMapping } from './mapping.js';

export const intuneConnector = defineConnector({
  identity: {
    id: 'intune',
    displayName: 'Microsoft Intune',
    version: '0.0.1',
  },
  auth: intuneAuth,
  fetch: intuneFetch,
  mapping: intuneMapping,
});

export { intuneAuth, intuneFetch, intuneMapping };
export { mapIntuneDevice, type IntuneDevice } from './mapping.js';
