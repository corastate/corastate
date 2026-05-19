/**
 * linkHeader strategy + parser. The Okta-shape Link header is the primary
 * test fixture; the parser also needs to tolerate vendor variation (single
 * link, quoted vs unquoted rel, missing rel="next").
 */

import { describe, expect, it } from 'vitest';
import type { PageContext } from '../../pagination.js';
import { linkHeaderStrategy, parseLinkHeader } from './linkHeader.js';

function ctxWithLink(linkHeader: string | null): PageContext {
  const headers = new Headers();
  if (linkHeader !== null) headers.set('link', linkHeader);
  return {
    response: new Response(null, { headers }),
    body: {},
    url: 'https://example.okta.com/api/v1/users',
  };
}

describe('parseLinkHeader', () => {
  it('parses the canonical Okta two-rel header', () => {
    const header =
      '<https://example.okta.com/api/v1/users?limit=200>; rel="self", ' +
      '<https://example.okta.com/api/v1/users?after=abc&limit=200>; rel="next"';
    const links = parseLinkHeader(header);
    expect(links['self']).toBe('https://example.okta.com/api/v1/users?limit=200');
    expect(links['next']).toBe('https://example.okta.com/api/v1/users?after=abc&limit=200');
  });

  it('parses a single-link header (no next, no comma)', () => {
    const links = parseLinkHeader('<https://x.example/api/users?limit=1>; rel="self"');
    expect(links['self']).toBe('https://x.example/api/users?limit=1');
    expect(links['next']).toBeUndefined();
  });

  it('tolerates unquoted rel values', () => {
    const links = parseLinkHeader('<https://x/y>; rel=next');
    expect(links['next']).toBe('https://x/y');
  });

  it('returns an empty map for null/empty input', () => {
    expect(parseLinkHeader(null)).toEqual({});
    expect(parseLinkHeader(undefined)).toEqual({});
    expect(parseLinkHeader('')).toEqual({});
  });

  it('ignores malformed entries but keeps the well-formed ones', () => {
    const links = parseLinkHeader('garbage, <https://ok/y>; rel="next"');
    expect(links['next']).toBe('https://ok/y');
  });
});

describe('linkHeaderStrategy', () => {
  it('returns the next URL when rel="next" is present', () => {
    const ctx = ctxWithLink(
      '<https://example.okta.com/api/v1/users?after=abc>; rel="next"',
    );
    expect(linkHeaderStrategy.next(ctx, {})).toEqual({
      url: 'https://example.okta.com/api/v1/users?after=abc',
    });
  });

  it('returns null when there is no rel="next"', () => {
    const ctx = ctxWithLink('<https://example.okta.com/api/v1/users>; rel="self"');
    expect(linkHeaderStrategy.next(ctx, {})).toBeNull();
  });

  it('returns null when the Link header is missing', () => {
    expect(linkHeaderStrategy.next(ctxWithLink(null), {})).toBeNull();
  });
});
