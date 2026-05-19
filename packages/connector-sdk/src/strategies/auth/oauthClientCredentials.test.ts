/**
 * oauthClientCredentials strategy. Mocks the token endpoint and verifies
 * the request shape (form-encoded body, grant_type, scope), the token cache
 * (expiresAt), and the proactive-refresh signal (isExpiringSoon).
 */

import { describe, expect, it, vi } from 'vitest';
import type { AuthStrategyContext } from '../../auth.js';
import {
  oauthClientCredentialsStrategy,
  isExpiringSoon,
} from './oauthClientCredentials.js';

function buildCtx(
  secrets: Record<string, string>,
  mockFetch: typeof fetch,
): AuthStrategyContext {
  return {
    secrets: {
      get(ref) {
        const v = secrets[ref.name];
        if (v === undefined) throw new Error(`unknown secret: ${ref.name}`);
        return v;
      },
    },
    log: {
      trace: vi.fn(),
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
    signal: new AbortController().signal,
    fetch: mockFetch,
  };
}

describe('oauthClientCredentialsStrategy', () => {
  it('posts client credentials and applies a Bearer header on success', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = init?.body as string;
      expect(body).toContain('grant_type=client_credentials');
      expect(body).toContain('client_id=app-1');
      expect(body).toContain('client_secret=shhh');
      expect(body).toContain('scope=https%3A%2F%2Fgraph.microsoft.com%2F.default');
      const headers = new Headers(init?.headers ?? undefined);
      expect(headers.get('content-type')).toBe('application/x-www-form-urlencoded');
      return new Response(
        JSON.stringify({ access_token: 'tk-1', token_type: 'Bearer', expires_in: 3600 }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });
    const ctx = buildCtx({ clientId: 'app-1', clientSecret: 'shhh' }, fetchMock as typeof fetch);
    const material = await oauthClientCredentialsStrategy.acquire(
      {
        tokenUrl: 'https://login.example.com/oauth/token',
        scope: 'https://graph.microsoft.com/.default',
      },
      ctx,
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]![0]).toBe('https://login.example.com/oauth/token');

    const headers = new Headers(material.apply({}).headers ?? undefined);
    expect(headers.get('authorization')).toBe('Bearer tk-1');

    expect(material.expiresAt).toBeInstanceOf(Date);
    const ttl = material.expiresAt!.getTime() - Date.now();
    expect(ttl).toBeGreaterThan(3500 * 1000);
    expect(ttl).toBeLessThanOrEqual(3600 * 1000);
  });

  it('threads extraBody params (e.g. audience) into the token request', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = init?.body as string;
      expect(body).toContain('audience=api%3A%2F%2Fcorastate');
      return new Response(
        JSON.stringify({ access_token: 'tk-2', expires_in: 3600 }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });
    const ctx = buildCtx({ clientId: 'a', clientSecret: 'b' }, fetchMock as typeof fetch);
    await oauthClientCredentialsStrategy.acquire(
      {
        tokenUrl: 'https://idp.example/oauth/token',
        extraBody: { audience: 'api://corastate' },
      },
      ctx,
    );
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('throws with a useful error when the token endpoint returns non-2xx', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: 'invalid_client' }), {
          status: 401,
          headers: { 'content-type': 'application/json' },
        }),
    );
    const ctx = buildCtx({ clientId: 'a', clientSecret: 'wrong' }, fetchMock as typeof fetch);
    await expect(
      oauthClientCredentialsStrategy.acquire(
        { tokenUrl: 'https://idp.example/oauth/token' },
        ctx,
      ),
    ).rejects.toThrow(/token endpoint returned 401/);
  });

  it('throws when access_token is missing from the response', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ token_type: 'Bearer' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );
    const ctx = buildCtx({ clientId: 'a', clientSecret: 'b' }, fetchMock as typeof fetch);
    await expect(
      oauthClientCredentialsStrategy.acquire(
        { tokenUrl: 'https://idp.example/oauth/token' },
        ctx,
      ),
    ).rejects.toThrow(/missing access_token/);
  });

  it('refresh() re-hits the token endpoint', async () => {
    let calls = 0;
    const fetchMock = vi.fn(async () => {
      calls += 1;
      return new Response(
        JSON.stringify({ access_token: `tk-${calls}`, expires_in: 3600 }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });
    const ctx = buildCtx({ clientId: 'a', clientSecret: 'b' }, fetchMock as typeof fetch);
    const params = { tokenUrl: 'https://idp.example/oauth/token' };
    const first = await oauthClientCredentialsStrategy.acquire(params, ctx);
    expect(new Headers(first.apply({}).headers ?? undefined).get('authorization')).toBe(
      'Bearer tk-1',
    );
    const refreshed = await oauthClientCredentialsStrategy.refresh!(first, params, ctx);
    expect(new Headers(refreshed.apply({}).headers ?? undefined).get('authorization')).toBe(
      'Bearer tk-2',
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('isExpiringSoon detects the safety window correctly', () => {
    const params = {
      tokenUrl: 'https://idp.example/oauth/token',
      refreshSafetyWindowSeconds: 60,
    };
    const now = new Date('2026-05-18T12:00:00Z');
    // 30 seconds away — inside the 60s window → expiring.
    expect(
      isExpiringSoon(
        { apply: (i) => i, expiresAt: new Date(now.getTime() + 30 * 1000) },
        params,
        now,
      ),
    ).toBe(true);
    // 120 seconds away — outside the window → not expiring.
    expect(
      isExpiringSoon(
        { apply: (i) => i, expiresAt: new Date(now.getTime() + 120 * 1000) },
        params,
        now,
      ),
    ).toBe(false);
    // No expiresAt — never expiring (defensive: should not be called for these).
    expect(isExpiringSoon({ apply: (i) => i }, params, now)).toBe(false);
  });
});
