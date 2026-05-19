/**
 * pageNumber — incrementing page-number query parameter.
 *
 * Stops when the response yields fewer items than the configured page size,
 * when the response carries an explicit "no more pages" flag, or when an
 * items array is empty. Used by Jamf Pro (`page=0,1,2…`) and the broader
 * class of paginated REST APIs that count pages rather than carry cursors.
 *
 * Phase 1 ships this as a registered strategy; the Jamf connector itself is
 * a scaffolded skeleton (architecture-v3 §"The first connectors as code").
 */

import type { NextPage, PageContext, PaginationStrategy } from '../../pagination.js';

export interface PageNumberParams {
  /** Query parameter that carries the page index (e.g. 'page'). */
  paramName: string;
  /** Page size — used to detect a short last page. */
  pageSize: number;
  /**
   * Optional dot-path inside the response body that holds the items array.
   * The strategy compares its length against `pageSize` to detect end-of-list.
   * If omitted, the strategy assumes the body itself is the array.
   */
  itemsField?: string;
  /** Starting index. Default 0; some APIs are 1-indexed. */
  startIndex?: number;
}

export const PAGE_NUMBER_STRATEGY_NAME = 'pageNumber';

function readArrayLength(body: unknown, path?: string): number | null {
  if (!body) return null;
  if (Array.isArray(body) && !path) return body.length;
  if (!path) return null;
  let cur: unknown = body;
  for (const segment of path.split('.')) {
    if (!cur || typeof cur !== 'object') return null;
    cur = (cur as Record<string, unknown>)[segment];
  }
  if (Array.isArray(cur)) return cur.length;
  return null;
}

export const pageNumberStrategy: PaginationStrategy<PageNumberParams> = {
  name: PAGE_NUMBER_STRATEGY_NAME,
  next(ctx: PageContext, params: PageNumberParams): NextPage | null {
    const items = readArrayLength(ctx.body, params.itemsField);
    if (items !== null && items < params.pageSize) return null;
    if (items === 0) return null;

    const currentParams = ctx.params ?? {};
    const current = currentParams[params.paramName];
    const startIndex = params.startIndex ?? 0;
    const parsed = current !== undefined ? Number.parseInt(current, 10) : startIndex;
    const nextNumber = Number.isFinite(parsed) ? parsed + 1 : startIndex + 1;
    return {
      params: {
        ...currentParams,
        [params.paramName]: String(nextNumber),
      },
    };
  },
};
