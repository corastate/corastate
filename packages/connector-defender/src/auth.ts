// Microsoft Defender auth — Azure AD OAuth client credentials. Composes the
// SDK's `oauthClientCredentials` strategy via the typed helper so the
// connector package never reaches into strategy internals.
//
// Per-tenant: the token URL embeds the tenant id; the factory in index.ts
// substitutes it at construction time. Secret names follow the
// `<connector>.<purpose>` convention so the credential store can be browsed
// by source id without naming collisions.

import {
  oauthClientCredentialsAuth,
  type ConnectorAuth,
  type OAuthClientCredentialsParams,
} from '@corastate/connector-sdk';

export interface DefenderAuthOptions {
  /** Azure AD tenant id (uuid). */
  tenantId: string;
}

export function buildDefenderAuth(options: DefenderAuthOptions): ConnectorAuth<OAuthClientCredentialsParams> {
  return oauthClientCredentialsAuth({
    tokenUrl: `https://login.microsoftonline.com/${options.tenantId}/oauth2/v2.0/token`,
    scope: 'https://graph.microsoft.com/.default',
    clientIdSecret: 'defender.client_id',
    clientSecretSecret: 'defender.client_secret',
  }) as ConnectorAuth<OAuthClientCredentialsParams>;
}

/**
 * Placeholder auth block exported for tests and code that wants a
 * default-shaped value. The worker calls `buildDefenderAuth` directly so it
 * can thread the per-source tenant id through.
 */
export const defenderAuth: ConnectorAuth<OAuthClientCredentialsParams> = buildDefenderAuth({
  tenantId: '00000000-0000-0000-0000-000000000000',
});
