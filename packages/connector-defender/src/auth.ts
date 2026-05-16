// Microsoft Defender auth — Azure AD OAuth client credentials. Composes the
// registry's `oauthClientCredentials` strategy.

import { secret, type ConnectorAuth } from '@corastate/connector-sdk';

export interface OAuthClientCredentialsParams {
  tokenUrl: string;
  scopes: string[];
}

export const defenderAuth: ConnectorAuth<OAuthClientCredentialsParams> = {
  strategyName: 'oauthClientCredentials',
  params: {
    // Per-tenant override at runtime; Phase 1 reads tenant id from connector config.
    tokenUrl: 'https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/token',
    scopes: ['https://graph.microsoft.com/.default'],
  },
  secretRefs: {
    clientId: secret('defender.client_id'),
    clientSecret: secret('defender.client_secret'),
  },
};
