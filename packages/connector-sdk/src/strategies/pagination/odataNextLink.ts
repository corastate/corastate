/**
 * odataNextLink — Microsoft Graph / OData `@odata.nextLink` pagination.
 *
 * The response body carries `@odata.nextLink` as an absolute URL when more
 * pages exist; the strategy uses it directly. Used by Microsoft Graph
 * (Defender, Intune) and any OData v4 vendor surface.
 *
 * Architecture-v3 §"The named-strategy registry".
 */

import type { NextPage, PageContext, PaginationStrategy } from '../../pagination.js';

export interface ODataNextLinkParams {
  /** Body field carrying the next-link URL. OData v4 default is '@odata.nextLink'. */
  nextLinkField?: string;
}

export const ODATA_NEXT_LINK_STRATEGY_NAME = 'odataNextLink';

export const odataNextLinkStrategy: PaginationStrategy<ODataNextLinkParams> = {
  name: ODATA_NEXT_LINK_STRATEGY_NAME,
  next(ctx: PageContext, params: ODataNextLinkParams): NextPage | null {
    const field = params.nextLinkField ?? '@odata.nextLink';
    const body = ctx.body as Record<string, unknown> | null | undefined;
    if (!body || typeof body !== 'object') return null;
    const value = body[field];
    if (typeof value !== 'string' || value.length === 0) return null;
    return { url: value };
  },
};
