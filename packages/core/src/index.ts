/**
 * Public surface of @corastate/core.
 *
 * The framework that runs connectors and exposes the read API. Today it is
 * three files: observation writes, correlation, current-state reads.
 */

export * from './observations.js';
export * from './correlate.js';
export * from './current-state.js';
