// CrowdStrike Falcon auth — OAuth2 client credentials against the Falcon API
// gateway. Composes the registry's `oauthClientCredentials` strategy.

import { secret, type ConnectorAuth } from '@corastate/connector-sdk';

export const crowdstrikeAuth: ConnectorAuth = {
  strategyName: 'oauthClientCredentials',
  params: {
    // Region-specific; the US-1 cloud by default. Worker overrides for EU/US-2.
    tokenUrl: 'https://api.crowdstrike.com/oauth2/token',
    scopes: [],
  },
  secretRefs: {
    clientId: secret('crowdstrike.client_id'),
    clientSecret: secret('crowdstrike.client_secret'),
  },
};
