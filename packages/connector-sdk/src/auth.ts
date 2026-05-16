// Auth strategy contract. Reviewed implementations live in the registry; a
// connector's auth.ts only references them by name.

import type { Logger } from './logger.js';
import type { ResolvedSecrets, SecretRef } from './secrets.js';

/**
 * What a strategy produces. The runner asks the strategy for one of these per
 * sync (or per refresh) and applies it to outgoing requests via `apply`.
 */
export interface AuthMaterial {
  /** Mutates a `RequestInit` (or fetch options) to carry the auth. */
  apply(init: RequestInit): RequestInit;
  /** UTC timestamp the material stops being valid. Omitted for non-expiring auth. */
  expiresAt?: Date;
}

export interface AuthStrategyContext {
  secrets: ResolvedSecrets;
  log: Logger;
  signal: AbortSignal;
  /** http fetch the strategy should use for token endpoints. Injected for testability. */
  fetch: typeof fetch;
}

/**
 * Reviewed auth behaviors. v3 Phase 1 registry ships `staticToken` and
 * `oauthClientCredentials` (architecture-v3.md §"The named-strategy registry").
 *
 * `TParams` is the strategy-specific parameter block the connector's auth.ts
 * passes in. The strategy validates its own params at registration time.
 */
export interface AuthStrategy<TParams = unknown> {
  /** Stable name; the registry key. */
  name: string;
  /** Produce auth material for the connector. */
  acquire(params: TParams, ctx: AuthStrategyContext): Promise<AuthMaterial>;
  /**
   * Refresh proactively before `material.expiresAt`. If the strategy does not
   * implement this, the runner re-acquires.
   */
  refresh?(
    material: AuthMaterial,
    params: TParams,
    ctx: AuthStrategyContext,
  ): Promise<AuthMaterial>;
}

/**
 * What the connector's auth.ts returns: which strategy to use, the params it
 * needs, and the secret refs the runner has to resolve before calling acquire.
 */
export interface ConnectorAuth<TParams = unknown> {
  strategyName: string;
  params: TParams;
  /** Named secrets the strategy expects in `ctx.secrets`. */
  secretRefs: Record<string, SecretRef>;
}
