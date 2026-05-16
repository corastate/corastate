// Single source of truth for the shapes the whole app speaks.
// Canonical device + identity, the correlation config format, and the
// API request/response schemas. Types are inferred (z.infer) — never hand-written.

export * from './device.js';
export * from './identity.js';
export * from './correlation-config.js';
export * from './api.js';
