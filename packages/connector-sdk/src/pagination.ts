// Pagination strategy contract. Reviewed implementations live in the registry;
// a connector's fetch.ts only references them by name. v3 Phase 1 registry
// ships `linkHeader`, `odataNextLink`, `pageNumber`, `cursorParam`.

export interface PageContext<TBody = unknown> {
  /** The fetch Response just returned. Strategies read headers from this. */
  response: Response;
  /** Parsed response body. JSON is the only shape v1 supports. */
  body: TBody;
  /** The URL that produced this response. */
  url: string;
  /** Query/body params that produced this response. */
  params?: Record<string, string>;
}

export interface NextPage {
  /** Absolute URL, or relative path to be joined with baseUrl. */
  url?: string;
  /** Query params for the next request. */
  params?: Record<string, string>;
}

/**
 * Returns `null` when there are no more pages, otherwise the next request shape.
 */
export interface PaginationStrategy<TParams = unknown> {
  name: string;
  next(ctx: PageContext, params: TParams): NextPage | null;
}

/**
 * Per-endpoint description carried in the connector's fetch.ts.
 */
export interface EndpointSpec {
  /** Logical name; appears in logs and observation source records. */
  name: string;
  /** Path relative to ConnectorFetch.baseUrl. */
  path: string;
  /** Which canonical entity kind this endpoint yields. */
  entityKind: 'device' | 'identity';
  /** Initial query params, if any. */
  initialParams?: Record<string, string>;
}

/**
 * What the connector's fetch.ts returns: where to call, how to walk, where
 * auth goes. The mapping module shapes the records yielded from these.
 */
export interface ConnectorFetch<TPaginationParams = unknown> {
  baseUrl: string;
  paginationStrategyName: string;
  paginationParams: TPaginationParams;
  endpoints: EndpointSpec[];
  /** Where auth material attaches to outgoing requests. */
  authPlacement: 'header' | 'query';
  /**
   * Optional incremental-sync hint. Phase 1 carries the field name; the
   * runner uses it to filter (`?lastUpdated gt $since` etc.). Fleshed out in
   * Week 2.
   */
  incremental?: {
    cursorField: string;
    paramName: string;
  };
}
