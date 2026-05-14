/**
 * Thin wrapper around the Okta Users API. Skeleton only.
 *
 * What this needs to grow into, in rough priority order:
 *   1. Token-bucket rate limiting that respects Okta's per-org concurrency
 *      caps and the X-Rate-Limit-Remaining response headers.
 *   2. Cursor-based pagination using the Link: rel="next" header (Okta does
 *      not return a JSON cursor; you parse the response header).
 *   3. Retry with backoff on 429 and 5xx.
 *   4. ETag support for the incremental sync path.
 */

export interface OktaConfig {
  /** The org domain, e.g. 'acme.okta.com'. No protocol. */
  domain: string;
  /** SSWS API token. Long-lived but operator-rotatable. */
  apiToken: string;
}

/**
 * Subset of the Okta user shape the connector cares about. The full payload
 * has ~40 fields; we deliberately type only what we map to observations.
 */
export interface OktaUser {
  id: string;
  status: string;
  created: string;
  activated: string | null;
  lastLogin: string | null;
  lastUpdated: string;
  profile: {
    firstName?: string;
    lastName?: string;
    email: string;
    login: string;
  };
}

export class OktaApi {
  private readonly baseUrl: string;

  constructor(private readonly config: OktaConfig) {
    if (!config.domain) {
      throw new Error('OktaApi: domain is required');
    }
    if (!config.apiToken) {
      throw new Error('OktaApi: apiToken is required');
    }
    this.baseUrl = `https://${config.domain.replace(/^https?:\/\//, '').replace(/\/$/, '')}`;
  }

  /**
   * Hit /api/v1/users/me to verify the token. Used by `authenticate` on the
   * connector. Not implemented yet.
   */
  async whoami(): Promise<{ id: string; login: string }> {
    // TODO: real fetch with timeout and 401 handling.
    throw new Error('OktaApi.whoami: not implemented');
  }

  /**
   * Stream every user in the org. Should yield in pages of 200 (Okta's max)
   * and honor the Link: rel="next" header for cursoring.
   */
  async *listUsers(_signal: AbortSignal): AsyncIterable<OktaUser> {
    // TODO: paginated fetch from /api/v1/users.
    throw new Error('OktaApi.listUsers: not implemented');
    // The yield below keeps TypeScript happy about the generator return type.
    // eslint-disable-next-line no-unreachable
    yield {} as OktaUser;
  }
}
