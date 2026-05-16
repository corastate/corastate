// The connector contract. `defineConnector` is the only authoring API.

import type { ConnectorAuth } from './auth.js';
import type { ConnectorFetch } from './pagination.js';
import type { ConnectorMapping } from './mapping.js';

export interface ConnectorIdentity {
  /** Stable id used as the `source` on observations. Lower-kebab. */
  id: string;
  /** Display name shown in the UI. */
  displayName: string;
  /** Semver, recorded on each sync run. */
  version: string;
}

export interface Connector {
  identity: ConnectorIdentity;
  auth: ConnectorAuth;
  fetch: ConnectorFetch;
  mapping: ConnectorMapping;
}

export interface DefineConnectorInput {
  identity: ConnectorIdentity;
  auth: ConnectorAuth;
  fetch: ConnectorFetch;
  mapping: ConnectorMapping;
}

/**
 * The connector authoring entry point. A package's index.ts calls this with
 * its three pieces and exports the result. The runner consumes the returned
 * object only — connector packages never see the runner.
 */
export function defineConnector(input: DefineConnectorInput): Connector {
  return input;
}
