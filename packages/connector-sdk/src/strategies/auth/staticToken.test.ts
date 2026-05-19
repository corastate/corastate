/**
 * staticToken strategy: applies a single non-expiring credential to outgoing
 * requests. The tests cover header composition (SSWS for Okta, Bearer for
 * PAT-style auth), the secret-ref lookup path, and the empty-secret failure
 * mode (a connector with an empty credential is a configuration error, not
 * a silent 401).
 */

import { describe, expect, it, vi } from 'vitest';
import type { AuthStrategyContext } from '../../auth.js';
import { staticTokenStrategy } from './staticToken.js';

function buildCtx(secrets: Record<string, string>): AuthStrategyContext {
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
    fetch: vi.fn(),
  };
}

describe('staticTokenStrategy', () => {
  it('applies an SSWS Authorization header (Okta shape)', async () => {
    const ctx = buildCtx({ apiToken: 'okta-token-xyz' });
    const material = await staticTokenStrategy.acquire(
      { header: 'Authorization', prefix: 'SSWS ' },
      ctx,
    );

    const init: RequestInit = {};
    const next = material.apply(init);
    const headers = new Headers(next.headers ?? undefined);
    expect(headers.get('authorization')).toBe('SSWS okta-token-xyz');
    expect(material.expiresAt).toBeUndefined();
  });

  it('supports the Bearer-prefix shape', async () => {
    const ctx = buildCtx({ apiToken: 'pat-abc' });
    const material = await staticTokenStrategy.acquire(
      { header: 'Authorization', prefix: 'Bearer ' },
      ctx,
    );
    const headers = new Headers(material.apply({}).headers ?? undefined);
    expect(headers.get('authorization')).toBe('Bearer pat-abc');
  });

  it('preserves caller-supplied headers when applying auth', async () => {
    const ctx = buildCtx({ apiToken: 'tok' });
    const material = await staticTokenStrategy.acquire(
      { header: 'Authorization', prefix: 'SSWS ' },
      ctx,
    );
    const next = material.apply({
      headers: { accept: 'application/json', 'x-trace-id': 'abc' },
    });
    const headers = new Headers(next.headers ?? undefined);
    expect(headers.get('accept')).toBe('application/json');
    expect(headers.get('x-trace-id')).toBe('abc');
    expect(headers.get('authorization')).toBe('SSWS tok');
  });

  it('honors a custom tokenRef parameter', async () => {
    const ctx = buildCtx({ pat: 'pat-value' });
    const material = await staticTokenStrategy.acquire(
      { header: 'Authorization', prefix: 'Bearer ', tokenRef: 'pat' },
      ctx,
    );
    const headers = new Headers(material.apply({}).headers ?? undefined);
    expect(headers.get('authorization')).toBe('Bearer pat-value');
  });

  it('throws when the secret resolves to empty', async () => {
    const ctx = buildCtx({ apiToken: '' });
    await expect(
      staticTokenStrategy.acquire({ header: 'Authorization', prefix: 'SSWS ' }, ctx),
    ).rejects.toThrow(/staticToken: secret 'apiToken' resolved to empty/);
  });
});
