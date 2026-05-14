/**
 * Okta connector.
 *
 * Reads identities from one Okta org. Declares the `identities` read capability
 * and nothing else; webhook and write support land in later versions.
 *
 * Auth: an SSWS API token scoped to read users. Future versions add OAuth
 * service-app auth for orgs that prefer it.
 */

import type {
  Action,
  ActionContext,
  ActionResult,
  AuthConfig,
  AuthResult,
  Connector,
  ConnectorCapabilities,
  Observation,
  SyncContext,
} from '@corastate/connector-sdk';

import { OktaApi, type OktaConfig } from './api.js';

const CONNECTOR_ID = 'okta';
const CONNECTOR_VERSION = '0.1.0';

const capabilities: ConnectorCapabilities = {
  reads: [
    // Incremental once we wire the `lastUpdated gt ${watermark}` filter
    // through OktaApi.listUsers. The Users API supports this directly.
    { kind: 'identities', supportsIncremental: true },
  ],
  // No writes in v1.
  // No webhooks in v1; the Okta Event Hooks integration lands in v1.1.
};

function parseConfig(config: AuthConfig): OktaConfig {
  const domain = typeof config.domain === 'string' ? config.domain : '';
  const apiToken = typeof config.apiToken === 'string' ? config.apiToken : '';
  return { domain, apiToken };
}

export const oktaConnector: Connector = {
  id: CONNECTOR_ID,
  version: CONNECTOR_VERSION,
  displayName: 'Okta',
  capabilities,

  async authenticate(config: AuthConfig): Promise<AuthResult> {
    const parsed = parseConfig(config);
    if (!parsed.domain || !parsed.apiToken) {
      return { ok: false, reason: 'Both domain and apiToken are required.' };
    }
    // TODO: real call to api.whoami(). Until that lands, fail loudly so the
    // operator does not think the connector is configured when it is not.
    throw new Error('oktaConnector.authenticate: not implemented');
  },

  // eslint-disable-next-line require-yield
  async *sync(ctx: SyncContext): AsyncIterable<Observation> {
    ctx.log.info({ runId: ctx.runId }, 'okta sync starting');
    // TODO: implement.
    //  1. Read OktaConfig from the connector's config store (not yet defined).
    //  2. const api = new OktaApi(config);
    //  3. For each OktaUser yielded by api.listUsers(ctx.signal):
    //       yield { source: 'okta', sourceRecordId: user.id,
    //               entityKind: 'identity', attribute: 'email',
    //               value: user.profile.email, observedAt: new Date(user.lastUpdated) };
    //       ... and one yield per tracked attribute (status, lastLogin, login, etc.).
    throw new Error('oktaConnector.sync: not implemented');
  },

  // No execute method: writes are not declared, framework will not call it.
};

/**
 * Re-export the api wrapper so the framework or operators can poke at it from
 * a debug shell without instantiating the full connector.
 */
export { OktaApi };
export type { OktaConfig };

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function _typeCheckExecuteNeverDeclared(
  _: Action,
  __: ActionContext,
): Promise<ActionResult> {
  // The Okta connector declares no writes, so it has no execute method.
  // This unused function exists only to keep the imports tree-shake-safe and
  // to make the contract explicit in the source.
  throw new Error('unreachable');
}
