// Jamf Pro auth — modern Jamf Pro API uses OAuth client credentials.

import { secret, type ConnectorAuth } from '@corastate/connector-sdk';

export const jamfAuth: ConnectorAuth = {
  strategyName: 'oauthClientCredentials',
  params: {
    // Per-tenant; the worker fills in {tenant}.
    tokenUrl: 'https://{tenant}.jamfcloud.com/api/oauth/token',
    scopes: [],
  },
  secretRefs: {
    clientId: secret('jamf.client_id'),
    clientSecret: secret('jamf.client_secret'),
  },
};
