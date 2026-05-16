// Jamf Pro connector. Scaffolded skeleton; not authored in Phase 1.

import { defineConnector } from '@corastate/connector-sdk';
import { jamfAuth } from './auth.js';
import { jamfFetch } from './fetch.js';
import { jamfMapping } from './mapping.js';

export const jamfConnector = defineConnector({
  identity: {
    id: 'jamf',
    displayName: 'Jamf Pro',
    version: '0.0.1',
  },
  auth: jamfAuth,
  fetch: jamfFetch,
  mapping: jamfMapping,
});

export { jamfAuth, jamfFetch, jamfMapping };
export { mapJamfComputer, type JamfComputer } from './mapping.js';
