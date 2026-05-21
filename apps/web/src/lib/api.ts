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
  overviewResponseSchema,
  sourceListResponseSchema,
  type DeviceComplianceFilter,
  type DeviceListResponse,
  type DeviceSortField,
  type HealthResponse,
  type IdentityListResponse,
  type OverviewResponse,
  type SortDirection,
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

export interface DeviceListParams extends CursorPageParams {
  sources?: string[];
  missingFrom?: string[];
  compliance?: DeviceComplianceFilter[];
  platform?: string[];
  hasGaps?: boolean;
  staleOnly?: boolean;
  sort?: DeviceSortField;
  dir?: SortDirection;
}

function withCursorQuery(path: string, params: CursorPageParams): string {
  const url = new URL(path, window.location.origin);
  if (params.limit !== undefined) url.searchParams.set('limit', String(params.limit));
  if (params.cursor) url.searchParams.set('cursor', params.cursor);
  if (params.q) url.searchParams.set('q', params.q);
  return `${url.pathname}${url.search}`;
}

function withDevicesQuery(params: DeviceListParams): string {
  const url = new URL('/v1/devices', window.location.origin);
  if (params.limit !== undefined) url.searchParams.set('limit', String(params.limit));
  if (params.cursor) url.searchParams.set('cursor', params.cursor);
  if (params.q) url.searchParams.set('q', params.q);
  if (params.sources && params.sources.length > 0) {
    url.searchParams.set('sources', params.sources.join(','));
  }
  if (params.missingFrom && params.missingFrom.length > 0) {
    url.searchParams.set('missingFrom', params.missingFrom.join(','));
  }
  if (params.compliance && params.compliance.length > 0) {
    url.searchParams.set('compliance', params.compliance.join(','));
  }
  if (params.platform && params.platform.length > 0) {
    url.searchParams.set('platform', params.platform.join(','));
  }
  if (params.hasGaps) url.searchParams.set('hasGaps', 'true');
  if (params.staleOnly) url.searchParams.set('staleOnly', 'true');
  if (params.sort) url.searchParams.set('sort', params.sort);
  if (params.dir) url.searchParams.set('dir', params.dir);
  return `${url.pathname}${url.search}`;
}

export function getHealth(): Promise<HealthResponse> {
  return getJson('/internal/healthz', healthResponseSchema);
}

export function getDevices(params: DeviceListParams = {}): Promise<DeviceListResponse> {
  return getJson(withDevicesQuery(params), deviceListResponseSchema);
}

export function getIdentities(params: CursorPageParams = {}): Promise<IdentityListResponse> {
  return getJson(withCursorQuery('/v1/identities', params), identityListResponseSchema);
}

export function getSources(): Promise<SourceListResponse> {
  return getJson('/v1/sources', sourceListResponseSchema);
}

export function getOverview(): Promise<OverviewResponse> {
  return getJson('/v1/overview', overviewResponseSchema);
}

// queryOptions factories — co-located with the fetchers so call sites stay
// short and a query key change cannot drift from its fetcher.

export const healthQuery = () =>
  queryOptions({
    queryKey: ['health'] as const,
    queryFn: () => getHealth(),
    staleTime: 10_000,
  });

export const devicesQuery = (params: DeviceListParams) =>
  queryOptions({
    queryKey: ['devices', params] as const,
    queryFn: () => getDevices(params),
    staleTime: 5_000,
    placeholderData: (prev) => prev,
  });

export const overviewQuery = () =>
  queryOptions({
    queryKey: ['overview'] as const,
    queryFn: () => getOverview(),
    staleTime: 10_000,
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
