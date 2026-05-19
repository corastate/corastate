/**
 * cursorParam — opaque-cursor pagination via a body field re-injected as a
 * request query parameter.
 *
 * The response body carries a cursor at `cursorField`; the next request
 * carries the cursor value at `paramName` in the query string. Terminates
 * when the cursor field is absent or empty.
 *
 * Used by CrowdStrike (`offset` token in `meta.pagination`) and the long
 * tail of REST APIs that opaquely paginate. Phase 1 ships the skeleton —
 * full registration is in the registry from Week 2 (architecture-v3 §"The
 * first connectors as code"), but the CrowdStrike connector itself is a
 * scaffolded skeleton, not proven end-to-end.
 */

import type { NextPage, PageContext, PaginationStrategy } from '../../pagination.js';

export interface CursorParamParams {
  /**
   * Path inside the response body to the cursor. Dot notation. Examples:
   *   'next_cursor'                — flat body field
   *   'meta.pagination.offset'     — nested
   * Phase 1 supports flat-or-nested-by-dot; arrays in the path are not
   * supported because no shipping connector needs them yet.
   */
  cursorField: string;
  /** Query parameter name the cursor is sent back as. */
  paramName: string;
}

export const CURSOR_PARAM_STRATEGY_NAME = 'cursorParam';

function readPath(obj: unknown, path: string): unknown {
  if (!obj || typeof obj !== 'object') return undefined;
  let cur: unknown = obj;
  for (const segment of path.split('.')) {
    if (!cur || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[segment];
  }
  return cur;
}

export const cursorParamStrategy: PaginationStrategy<CursorParamParams> = {
  name: CURSOR_PARAM_STRATEGY_NAME,
  next(ctx: PageContext, params: CursorParamParams): NextPage | null {
    const value = readPath(ctx.body, params.cursorField);
    if (value === null || value === undefined) return null;
    if (typeof value === 'string' && value.length === 0) return null;
    return {
      params: {
        ...(ctx.params ?? {}),
        [params.paramName]: String(value),
      },
    };
  },
};
