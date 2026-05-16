// Okta auth piece. Composes the registry's `staticToken` strategy and names
// the SSWS token via a secret ref. The token value is never in this file or
// this package; the runner resolves it from the encrypted credential store.

import { secret, type ConnectorAuth } from '@corastate/connector-sdk';

export interface OktaStaticTokenParams {
  /** Header name Okta expects, e.g. 'Authorization'. */
  header: string;
  /** Prefix applied to the secret value when building the header. */
  prefix: string;
}

export const oktaAuth: ConnectorAuth<OktaStaticTokenParams> = {
  strategyName: 'staticToken',
  params: {
    header: 'Authorization',
    prefix: 'SSWS ',
  },
  secretRefs: {
    apiToken: secret('okta.api_token'),
  },
};
