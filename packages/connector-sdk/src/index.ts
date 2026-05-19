// v3 segmented connector skeleton + named-strategy registry.
//
// A connector is composed of three pieces (auth, fetch, mapping) plus an
// identity block. The auth and fetch pieces select named strategies from the
// registry; the mapping module is the only per-vendor code path that lives in
// a connector package. See architecture-v3.md §"The connector model".

export * from './logger.js';
export * from './secrets.js';
export * from './auth.js';
export * from './pagination.js';
export * from './mapping.js';
export * from './connector.js';
export * from './registry.js';
export * from './strategies/index.js';
