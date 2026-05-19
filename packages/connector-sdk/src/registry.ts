// The named-strategy registry. Reviewed, typed, tested strategies live here;
// connector packages reference them by name. The registry is the Phase 3
// AI-companion's composition surface (architecture-v3.md §"The named-strategy
// registry") so its contract is deliberately frozen-shaped from the start.

import type { AuthStrategy } from './auth.js';
import type { PaginationStrategy } from './pagination.js';
import {
  staticTokenStrategy,
  oauthClientCredentialsStrategy,
} from './strategies/index.js';
import {
  linkHeaderStrategy,
  odataNextLinkStrategy,
  cursorParamStrategy,
  pageNumberStrategy,
} from './strategies/index.js';

export interface NamedStrategyRegistry {
  readonly auth: ReadonlyMap<string, AuthStrategy<unknown>>;
  readonly pagination: ReadonlyMap<string, PaginationStrategy<unknown>>;
}

export interface MutableRegistry {
  auth: Map<string, AuthStrategy<unknown>>;
  pagination: Map<string, PaginationStrategy<unknown>>;
}

export function createRegistry(): MutableRegistry {
  return {
    auth: new Map<string, AuthStrategy<unknown>>(),
    pagination: new Map<string, PaginationStrategy<unknown>>(),
  };
}

export function registerAuth<TParams>(
  reg: MutableRegistry,
  strategy: AuthStrategy<TParams>,
): void {
  if (reg.auth.has(strategy.name)) {
    throw new Error(`AuthStrategy already registered: ${strategy.name}`);
  }
  reg.auth.set(strategy.name, strategy as AuthStrategy<unknown>);
}

export function registerPagination<TParams>(
  reg: MutableRegistry,
  strategy: PaginationStrategy<TParams>,
): void {
  if (reg.pagination.has(strategy.name)) {
    throw new Error(`PaginationStrategy already registered: ${strategy.name}`);
  }
  reg.pagination.set(strategy.name, strategy as PaginationStrategy<unknown>);
}

/**
 * Build the Phase 1 default registry. Each call returns a fresh registry so
 * tests can mutate without contaminating other tests.
 */
export function buildDefaultRegistry(): MutableRegistry {
  const reg = createRegistry();
  registerAuth(reg, staticTokenStrategy);
  registerAuth(reg, oauthClientCredentialsStrategy);
  registerPagination(reg, linkHeaderStrategy);
  registerPagination(reg, odataNextLinkStrategy);
  registerPagination(reg, cursorParamStrategy);
  registerPagination(reg, pageNumberStrategy);
  return reg;
}

/** Process-wide default registry. The runner reads from here. */
export const defaultRegistry: NamedStrategyRegistry = buildDefaultRegistry();

/** Strategy names the Phase 1 plan commits to shipping. */
export const PLANNED_AUTH_STRATEGIES = ['staticToken', 'oauthClientCredentials'] as const;
export const PLANNED_PAGINATION_STRATEGIES = [
  'linkHeader',
  'odataNextLink',
  'pageNumber',
  'cursorParam',
] as const;

export type PlannedAuthStrategy = (typeof PLANNED_AUTH_STRATEGIES)[number];
export type PlannedPaginationStrategy = (typeof PLANNED_PAGINATION_STRATEGIES)[number];
