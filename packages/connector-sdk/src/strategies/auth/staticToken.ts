/**
 * staticToken — single non-expiring credential applied to every request.
 *
 * Phase 1 covers Okta (SSWS) and any vendor that wants a long-lived API key
 * or PAT in the Authorization header. The strategy reads exactly one secret
 * (named `apiToken` in the resolved set), composes the header value as
 * `${prefix}${token}`, and attaches it on each outgoing request.
 *
 * Architecture-v3 §"The named-strategy registry".
 */

import type { AuthMaterial, AuthStrategy, AuthStrategyContext } from '../../auth.js';
import { secret, type SecretRef } from '../../secrets.js';

export interface StaticTokenParams {
  /** HTTP header to set. Almost always 'Authorization'. */
  header: string;
  /** Prefix applied before the token value. e.g. 'SSWS ' for Okta, 'Bearer ' for OAuth-style PATs. */
  prefix: string;
  /**
   * Logical name of the secret in the strategy's secretRefs map. Defaults to
   * 'apiToken'. Connectors that want to name their secret differently can
   * override.
   */
  tokenRef?: string;
}

export const STATIC_TOKEN_STRATEGY_NAME = 'staticToken';

export const staticTokenStrategy: AuthStrategy<StaticTokenParams> = {
  name: STATIC_TOKEN_STRATEGY_NAME,
  async acquire(params, ctx: AuthStrategyContext): Promise<AuthMaterial> {
    const refName = params.tokenRef ?? 'apiToken';
    const token = ctx.secrets.get({ name: refName });
    if (!token) {
      throw new Error(`staticToken: secret '${refName}' resolved to empty value`);
    }
    const headerName = params.header;
    const headerValue = `${params.prefix}${token}`;
    return {
      apply(init: RequestInit): RequestInit {
        const headers = new Headers(init.headers ?? undefined);
        headers.set(headerName, headerValue);
        return { ...init, headers };
      },
      // No expiresAt — strategy never refreshes.
    };
  },
};

/**
 * Helper for connector authors: a typed `ConnectorAuth` block configured to
 * use this strategy. Authoring a static-token auth piece is then a one-liner
 * in the connector's auth.ts.
 */
export function staticTokenAuth(input: {
  /** HTTP header, e.g. 'Authorization'. */
  header?: string;
  /** Prefix, e.g. 'SSWS ' or 'Bearer '. */
  prefix: string;
  /** Logical credential name (the SecretRef.name). */
  secretName: string;
}): {
  strategyName: string;
  params: StaticTokenParams;
  secretRefs: Record<string, SecretRef>;
} {
  return {
    strategyName: STATIC_TOKEN_STRATEGY_NAME,
    params: {
      header: input.header ?? 'Authorization',
      prefix: input.prefix,
    },
    secretRefs: {
      apiToken: secret(input.secretName),
    },
  };
}
