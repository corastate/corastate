/**
 * linkHeader — RFC 5988 Link-header pagination.
 *
 * Parses the response's `Link` header, finds the entry with `rel="next"`, and
 * uses its absolute URL as the next request URL. When no `rel="next"` is
 * present, pagination ends.
 *
 * Used by Okta (`/api/v1/users` etc.). The header looks like:
 *   Link: <https://example.okta.com/api/v1/users?limit=200&after=abc>; rel="next",
 *         <https://example.okta.com/api/v1/users?limit=200>; rel="self"
 *
 * Architecture-v3 §"The named-strategy registry".
 */

import type { NextPage, PageContext, PaginationStrategy } from '../../pagination.js';

export interface LinkHeaderParams {
  /** Page size hint; advertised to the connector author, applied to initial request only. */
  limit?: number;
}

export const LINK_HEADER_STRATEGY_NAME = 'linkHeader';

/**
 * Parse an RFC 5988 Link header into its rel-keyed map. Exported for unit
 * tests; the strategy uses it internally.
 *
 * Tolerates malformed entries (returns the entries it could parse) but does
 * not silently accept missing angle brackets or missing rel.
 */
export function parseLinkHeader(header: string | null | undefined): Record<string, string> {
  if (!header) return {};
  const result: Record<string, string> = {};
  // Entries are comma-separated, but commas inside URLs are uncommon for
  // pagination cursors. Split conservatively on `>,` (end-of-URL marker
  // followed by a separator) to be safe.
  const entries = header.split(/,\s*(?=<)/);
  for (const raw of entries) {
    const entry = raw.trim();
    if (!entry) continue;
    const match = /^<([^>]+)>\s*;\s*(.+)$/.exec(entry);
    if (!match) continue;
    const url = match[1]!;
    const paramsPart = match[2]!;
    // Extract rel="value" (or rel=value).
    const relMatch = /rel\s*=\s*"?([^";,\s]+)"?/i.exec(paramsPart);
    if (!relMatch) continue;
    const rel = relMatch[1]!;
    // First occurrence wins for any given rel.
    if (!(rel in result)) {
      result[rel] = url;
    }
  }
  return result;
}

export const linkHeaderStrategy: PaginationStrategy<LinkHeaderParams> = {
  name: LINK_HEADER_STRATEGY_NAME,
  next(ctx: PageContext, _params: LinkHeaderParams): NextPage | null {
    const header = ctx.response.headers.get('link');
    const links = parseLinkHeader(header);
    const nextUrl = links['next'];
    if (!nextUrl) return null;
    // Okta returns absolute URLs in Link headers; the runner joins relative
    // paths against baseUrl, but an absolute URL passes through unchanged.
    return { url: nextUrl };
  },
};
