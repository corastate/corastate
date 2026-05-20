/**
 * Thin typed HTTP client over /v1 and /internal. Every call validates the
 * response against the Zod schema in @corastate/contracts. The web app is
 * intentionally lock-step with the backend's contract surface — a schema
 * mismatch surfaces at the boundary, not deep in a list render.
 *
 * All product views go through TanStack Query, which calls the functions
 * here as its query fn. See queryOptions exports per surface in this file.
 */

import { queryOptions } from '@tanstack/react-query';
import type { z } from 'zod';

import {
  deviceListResponseSchema,
  healthResponseSchema,
  identityListResponseSchema,
  sourceListResponseSchema,
  type DeviceListResponse,
  type HealthResponse,
  type IdentityListResponse,
  type SourceListResponse,
} from '@corastate/contracts';

class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function getJson<T>(path: string, schema: z.ZodType<T>): Promise<T> {
  const res = await fetch(path, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new ApiError(res.status, body || `request to ${path} failed: ${res.status}`);
  }
  const json: unknown = await res.json();
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    throw new Error(
      `${path}: response did not match contract — ${parsed.error.issues
        .slice(0, 3)
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ')}`,
    );
  }
  return parsed.data;
}

export interface CursorPageParams {
  limit?: number;
  cursor?: string;
  q?: string;
}

function withQuery(path: string, params: CursorPageParams): string {
  const url = new URL(path, window.location.origin);
  if (params.limit !== undefined) url.searchParams.set('limit', String(params.limit));
  if (params.cursor) url.searchParams.set('cursor', params.cursor);
  if (params.q) url.searchParams.set('q', params.q);
  return `${url.pathname}${url.search}`;
}

export function getHealth(): Promise<HealthResponse> {
  return getJson('/internal/healthz', healthResponseSchema);
}

export function getDevices(params: CursorPageParams = {}): Promise<DeviceListResponse> {
  return getJson(withQuery('/v1/devices', params), deviceListResponseSchema);
}

export function getIdentities(params: CursorPageParams = {}): Promise<IdentityListResponse> {
  return getJson(withQuery('/v1/identities', params), identityListResponseSchema);
}

export function getSources(): Promise<SourceListResponse> {
  return getJson('/v1/sources', sourceListResponseSchema);
}

// queryOptions factories — co-located with the fetchers so call sites stay
// short and a query key change cannot drift from its fetcher.

export const healthQuery = () =>
  queryOptions({
    queryKey: ['health'] as const,
    queryFn: () => getHealth(),
    staleTime: 10_000,
  });

export const devicesQuery = (params: CursorPageParams) =>
  queryOptions({
    queryKey: ['devices', params] as const,
    queryFn: () => getDevices(params),
    staleTime: 5_000,
    placeholderData: (prev) => prev,
  });

export const identitiesQuery = (params: CursorPageParams) =>
  queryOptions({
    queryKey: ['identities', params] as const,
    queryFn: () => getIdentities(params),
    staleTime: 5_000,
    placeholderData: (prev) => prev,
  });

export const sourcesQuery = () =>
  queryOptions({
    queryKey: ['sources'] as const,
    queryFn: () => getSources(),
    staleTime: 5_000,
  });

export { ApiError };
