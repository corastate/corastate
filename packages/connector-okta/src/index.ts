// Okta connector — assembled from the three segmented pieces. The worker
// builds a per-source instance by calling createOktaConnector(baseUrl); the
// default export is kept for tests and CLI one-shots.
//
// Architecture-v3 §"The first connectors as code": Okta is one of two
// reference connectors hand-authored as code; the auth and fetch pieces
// compose registry strategies (`staticToken`, `linkHeader`), and the only
// per-vendor code is the pure mapping module.

import { defineConnector, type Connector } from '@corastate/connector-sdk';

import { oktaAuth } from './auth.js';
import { oktaFetch } from './fetch.js';
import { oktaMapping } from './mapping.js';

export interface OktaConnectorOptions {
  /** Per-tenant base URL, e.g. https://acme.okta.com. */
  baseUrl: string;
  /** Override the connector version. Defaults to package version. */
  version?: string;
}

export function createOktaConnector(options: OktaConnectorOptions): Connector {
  return defineConnector({
    identity: {
      id: 'okta',
      displayName: 'Okta',
      version: options.version ?? '0.1.0',
    },
    auth: oktaAuth,
    fetch: oktaFetch(options.baseUrl),
    mapping: oktaMapping,
  });
}

/**
 * Default connector instance with a placeholder base URL. The worker uses
 * `createOktaConnector` instead so it can thread the per-source URL through.
 */
export const oktaConnector = createOktaConnector({ baseUrl: 'https://example.okta.com' });

export { oktaAuth } from './auth.js';
export { oktaFetch } from './fetch.js';
export {
  oktaMapping,
  mapOktaUserToIdentity,
  mapOktaDevice,
  normalizeOktaStatus,
  type OktaDevice,
  type OktaUser,
} from './mapping.js';
