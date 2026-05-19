import { describe, expect, it } from 'vitest';
import type { PageContext } from '../../pagination.js';
import { odataNextLinkStrategy } from './odataNextLink.js';

function buildCtx(body: unknown): PageContext {
  return {
    response: new Response(null),
    body,
    url: 'https://graph.microsoft.com/v1.0/users',
  };
}

describe('odataNextLinkStrategy', () => {
  it('returns the @odata.nextLink URL when present', () => {
    const ctx = buildCtx({
      '@odata.context': 'https://graph.microsoft.com/v1.0/$metadata#users',
      '@odata.nextLink': 'https://graph.microsoft.com/v1.0/users?$skiptoken=abc',
      value: [],
    });
    expect(odataNextLinkStrategy.next(ctx, {})).toEqual({
      url: 'https://graph.microsoft.com/v1.0/users?$skiptoken=abc',
    });
  });

  it('returns null when there is no nextLink (last page)', () => {
    const ctx = buildCtx({ value: [{ id: '1' }] });
    expect(odataNextLinkStrategy.next(ctx, {})).toBeNull();
  });

  it('returns null for an empty body', () => {
    expect(odataNextLinkStrategy.next(buildCtx(null), {})).toBeNull();
    expect(odataNextLinkStrategy.next(buildCtx(undefined), {})).toBeNull();
  });

  it('honors a custom nextLinkField parameter', () => {
    const ctx = buildCtx({ next_page: 'https://x.example/y?cursor=2' });
    expect(odataNextLinkStrategy.next(ctx, { nextLinkField: 'next_page' })).toEqual({
      url: 'https://x.example/y?cursor=2',
    });
  });
});
