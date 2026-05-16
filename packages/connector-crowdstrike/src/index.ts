// CrowdStrike Falcon connector. Scaffolded skeleton; not authored in Phase 1
// (architecture-v3 §"The first connectors as code"). Real implementation lands
// in Phase 2.

import { defineConnector } from '@corastate/connector-sdk';
import { crowdstrikeAuth } from './auth.js';
import { crowdstrikeFetch } from './fetch.js';
import { crowdstrikeMapping } from './mapping.js';

export const crowdstrikeConnector = defineConnector({
  identity: {
    id: 'crowdstrike-falcon',
    displayName: 'CrowdStrike Falcon',
    version: '0.0.1',
  },
  auth: crowdstrikeAuth,
  fetch: crowdstrikeFetch,
  mapping: crowdstrikeMapping,
});

export { crowdstrikeAuth, crowdstrikeFetch, crowdstrikeMapping };
export { mapFalconHost, type FalconHost } from './mapping.js';
