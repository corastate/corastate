/**
 * oauthClientCredentials — OAuth2 client-credentials grant.
 *
 * Posts (client_id, client_secret, grant_type=client_credentials [, scope])
 * as `application/x-www-form-urlencoded` to a token endpoint, parses
 * `access_token` and `expires_in`, caches the token, applies it as
 * `Authorization: Bearer ${access_token}` on every outgoing request.
 *
 * Refresh policy: proactive. `refresh()` is called by the runner when the
 * material is within the safety window of expiry (default 60s); both
 * `acquire` and `refresh` re-hit the token endpoint. The strategy never
 * waits for a 401.
 *
 * Used by Microsoft Graph (Defender/Intune in later weeks), CrowdStrike, Jamf.
 * Architecture-v3 §"Explicit OAuth token lifecycle handling".
 */

import type { AuthMaterial, AuthStrategy, AuthStrategyContext } from '../../auth.js';
import { secret, type SecretRef } from '../../secrets.js';

export interface OAuthClientCredentialsParams {
  /** Absolute URL of the token endpoint. */
  tokenUrl: string;
  /** Space-separated OAuth scopes. Optional — some vendors infer. */
  scope?: string;
  /**
   * Logical name of the client_id secret (default 'clientId').
   * The runner resolves it via `ctx.secrets.get({name: clientIdRef})`.
   */
  clientIdRef?: string;
  /** Logical name of the client_secret secret (default 'clientSecret'). */
  clientSecretRef?: string;
  /**
   * Optional vendor-specific extra body params. Microsoft Graph wants no extras;
   * a few vendors require `resource` or `audience`.
   */
  extraBody?: Record<string, string>;
  /**
   * Refresh proactively when the material has fewer than this many seconds
   * until expiry. Default 60 seconds.
   */
  refreshSafetyWindowSeconds?: number;
}

interface TokenResponse {
  access_token: string;
  token_type?: string;
  expires_in?: number;
  scope?: string;
}

export const OAUTH_CLIENT_CREDENTIALS_STRATEGY_NAME = 'oauthClientCredentials';

const DEFAULT_SAFETY_WINDOW_SECONDS = 60;

async function fetchToken(
  params: OAuthClientCredentialsParams,
  ctx: AuthStrategyContext,
): Promise<AuthMaterial> {
  const clientId = ctx.secrets.get({ name: params.clientIdRef ?? 'clientId' });
  const clientSecret = ctx.secrets.get({ name: params.clientSecretRef ?? 'clientSecret' });

  const form = new URLSearchParams();
  form.set('grant_type', 'client_credentials');
  form.set('client_id', clientId);
  form.set('client_secret', clientSecret);
  if (params.scope) form.set('scope', params.scope);
  if (params.extraBody) {
    for (const [k, v] of Object.entries(params.extraBody)) {
      form.set(k, v);
    }
  }

  ctx.log.debug({ tokenUrl: params.tokenUrl }, 'oauthClientCredentials: requesting token');

  const response = await ctx.fetch(params.tokenUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      accept: 'application/json',
    },
    body: form.toString(),
    signal: ctx.signal,
  });

  if (!response.ok) {
    const bodyText = await response.text().catch(() => '<unreadable>');
    throw new Error(
      `oauthClientCredentials: token endpoint returned ${response.status}: ${bodyText.slice(0, 500)}`,
    );
  }

  const parsed = (await response.json()) as TokenResponse;
  if (!parsed.access_token || typeof parsed.access_token !== 'string') {
    throw new Error('oauthClientCredentials: token endpoint response missing access_token');
  }

  const expiresAt =
    typeof parsed.expires_in === 'number' && parsed.expires_in > 0
      ? new Date(Date.now() + parsed.expires_in * 1000)
      : undefined;

  const headerValue = `${parsed.token_type ?? 'Bearer'} ${parsed.access_token}`;

  return {
    apply(init: RequestInit): RequestInit {
      const headers = new Headers(init.headers ?? undefined);
      headers.set('Authorization', headerValue);
      return { ...init, headers };
    },
    ...(expiresAt ? { expiresAt } : {}),
  };
}

export const oauthClientCredentialsStrategy: AuthStrategy<OAuthClientCredentialsParams> = {
  name: OAUTH_CLIENT_CREDENTIALS_STRATEGY_NAME,
  async acquire(params, ctx) {
    return fetchToken(params, ctx);
  },
  async refresh(_material, params, ctx) {
    // Client-credentials has no refresh token; just re-acquire. The runner
    // calls this proactively before expiry per the safety window.
    return fetchToken(params, ctx);
  },
};

/**
 * Compute whether a piece of auth material is due for a proactive refresh.
 * The runner consults this between requests; the strategy advertises the
 * safety window via its params.
 */
export function isExpiringSoon(
  material: AuthMaterial,
  params: OAuthClientCredentialsParams,
  now: Date = new Date(),
): boolean {
  if (!material.expiresAt) return false;
  const safety = params.refreshSafetyWindowSeconds ?? DEFAULT_SAFETY_WINDOW_SECONDS;
  return material.expiresAt.getTime() - now.getTime() <= safety * 1000;
}

/**
 * Connector-authoring helper. Returns a typed ConnectorAuth block that selects
 * this strategy with the given token endpoint and secret names.
 */
export function oauthClientCredentialsAuth(input: {
  tokenUrl: string;
  scope?: string;
  /** Credential name for the client id (the SecretRef.name in the credential store). */
  clientIdSecret: string;
  /** Credential name for the client secret. */
  clientSecretSecret: string;
  extraBody?: Record<string, string>;
  refreshSafetyWindowSeconds?: number;
}): {
  strategyName: string;
  params: OAuthClientCredentialsParams;
  secretRefs: Record<string, SecretRef>;
} {
  return {
    strategyName: OAUTH_CLIENT_CREDENTIALS_STRATEGY_NAME,
    params: {
      tokenUrl: input.tokenUrl,
      ...(input.scope ? { scope: input.scope } : {}),
      ...(input.extraBody ? { extraBody: input.extraBody } : {}),
      ...(input.refreshSafetyWindowSeconds !== undefined
        ? { refreshSafetyWindowSeconds: input.refreshSafetyWindowSeconds }
        : {}),
    },
    secretRefs: {
      clientId: secret(input.clientIdSecret),
      clientSecret: secret(input.clientSecretSecret),
    },
  };
}
