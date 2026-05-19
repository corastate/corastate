/**
 * Public surface of @corastate/core.
 *
 * v3 organizes the package into:
 *   - the generic sync runner that drives any Connector (Phase 1 Week 2)
 *   - the correlation engine ported from correlator.py (Week 3)
 *   - the secrets module (envelope encryption, KeyProvider, audit writer,
 *     OAuth lifecycle, redaction) (Week 1)
 *   - the observation-log writer + current-state read helpers (Week 1/2)
 *
 * This structural commit ships the secrets module's KeyProvider. The rest
 * land as their respective Phase 1 weeks per phase-1-sprint-plan-v3.md.
 */

export * from './secrets/index.js';
export * from './observations/index.js';
export * from './sync/index.js';
