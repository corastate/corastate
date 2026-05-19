import { describe, expect, it } from 'vitest';
import type { PageContext } from '../../pagination.js';
import { cursorParamStrategy } from './cursorParam.js';

function ctx(body: unknown, params?: Record<string, string>): PageContext {
  return {
    response: new Response(null),
    body,
    url: 'https://api.crowdstrike.com/devices/queries/devices/v1',
    ...(params ? { params } : {}),
  };
}

describe('cursorParamStrategy', () => {
  it('reads a top-level cursor field and re-emits as a query param', () => {
    const result = cursorParamStrategy.next(
      ctx({ next_cursor: 'tok-abc', items: [] }),
      { cursorField: 'next_cursor', paramName: 'cursor' },
    );
    expect(result).toEqual({ params: { cursor: 'tok-abc' } });
  });

  it('reads a nested dot-path cursor', () => {
    const result = cursorParamStrategy.next(
      ctx({ meta: { pagination: { offset: 200 } } }),
      { cursorField: 'meta.pagination.offset', paramName: 'offset' },
    );
    expect(result).toEqual({ params: { offset: '200' } });
  });

  it('returns null when the cursor field is absent', () => {
    expect(
      cursorParamStrategy.next(ctx({ items: [] }), {
        cursorField: 'next_cursor',
        paramName: 'cursor',
      }),
    ).toBeNull();
  });

  it('returns null when the cursor is an empty string', () => {
    expect(
      cursorParamStrategy.next(ctx({ next_cursor: '' }), {
        cursorField: 'next_cursor',
        paramName: 'cursor',
      }),
    ).toBeNull();
  });

  it('preserves existing params (e.g. limit) on the next request', () => {
    const result = cursorParamStrategy.next(
      ctx({ next_cursor: 'abc' }, { limit: '100' }),
      { cursorField: 'next_cursor', paramName: 'cursor' },
    );
    expect(result).toEqual({ params: { limit: '100', cursor: 'abc' } });
  });
});
