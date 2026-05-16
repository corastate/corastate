// Okta connector — assembled from the three segmented pieces. The structural
// commit ships the wiring; Week 2 fills in mapping bodies and points the
// runner at a real tenant.

import { defineConnector } from '@corastate/connector-sdk';

import { oktaAuth } from './auth.js';
import { oktaFetch } from './fetch.js';
import { oktaMapping } from './mapping.js';

/**
 * Default tenant URL is a placeholder; the worker overrides via configured
 * connector settings before invoking the runner.
 */
const DEFAULT_BASE_URL = 'https://example.okta.com';

export const oktaConnector = defineConnector({
  identity: {
    id: 'okta',
    displayName: 'Okta',
    version: '0.1.0',
  },
  auth: oktaAuth,
  fetch: oktaFetch(DEFAULT_BASE_URL),
  mapping: oktaMapping,
});

export { oktaAuth } from './auth.js';
export { oktaFetch } from './fetch.js';
export { oktaMapping, mapOktaUserToIdentity, type OktaUser } from './mapping.js';
