// Intune auth — Azure AD OAuth client credentials, same gateway as Defender.

import { secret, type ConnectorAuth } from '@corastate/connector-sdk';

export const intuneAuth: ConnectorAuth = {
  strategyName: 'oauthClientCredentials',
  params: {
    tokenUrl: 'https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/token',
    scopes: ['https://graph.microsoft.com/.default'],
  },
  secretRefs: {
    clientId: secret('intune.client_id'),
    clientSecret: secret('intune.client_secret'),
  },
};
