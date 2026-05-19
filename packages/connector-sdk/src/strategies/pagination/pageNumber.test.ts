import { describe, expect, it } from 'vitest';
import type { PageContext } from '../../pagination.js';
import { pageNumberStrategy } from './pageNumber.js';

function ctx(body: unknown, params?: Record<string, string>): PageContext {
  return {
    response: new Response(null),
    body,
    url: 'https://jamf.example/api/v1/computers',
    ...(params ? { params } : {}),
  };
}

describe('pageNumberStrategy', () => {
  it('increments page when the array is full-sized', () => {
    const result = pageNumberStrategy.next(
      ctx({ results: new Array(100).fill({ id: 'x' }) }, { page: '0' }),
      { paramName: 'page', pageSize: 100, itemsField: 'results' },
    );
    expect(result).toEqual({ params: { page: '1' } });
  });

  it('stops when the items array is short of pageSize', () => {
    const result = pageNumberStrategy.next(
      ctx({ results: new Array(42).fill({ id: 'x' }) }, { page: '3' }),
      { paramName: 'page', pageSize: 100, itemsField: 'results' },
    );
    expect(result).toBeNull();
  });

  it('stops on an empty page (defensive)', () => {
    const result = pageNumberStrategy.next(
      ctx({ results: [] }, { page: '7' }),
      { paramName: 'page', pageSize: 100, itemsField: 'results' },
    );
    expect(result).toBeNull();
  });

  it('handles a bare-array body when itemsField is omitted', () => {
    const result = pageNumberStrategy.next(
      ctx(new Array(50).fill({}), { page: '0' }),
      { paramName: 'page', pageSize: 50 },
    );
    expect(result).toEqual({ params: { page: '1' } });
  });

  it('starts from the configured startIndex when no current param is set', () => {
    const result = pageNumberStrategy.next(
      ctx({ results: new Array(50).fill({}) }),
      { paramName: 'page', pageSize: 50, itemsField: 'results', startIndex: 1 },
    );
    // No `page` param yet → startIndex(1) → next = 2.
    expect(result).toEqual({ params: { page: '2' } });
  });
});
