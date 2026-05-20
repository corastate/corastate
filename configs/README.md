# configs/

This directory holds the **correlation layer** (config), separate from the connector layer (code). See architecture-v3.md §"Two layers with different rules".

## correlation.json

Match keys, source priority, and compliance rules consumed by the correlation engine. Validated at boot against `correlationConfigSchema` from `@corastate/contracts`; the loader fails loudly on a malformed config.

Phase 1 Week 3 ships the populated shape:

- `matchPriority`: ordered list of match keys ported from Device Spotlight (serial → azureAdDeviceId → hostname → hostname+serial → macAddresses → ownerEmail+hostname).
- `sourcePriority`: per canonical field, ordered list of source ids for tie-break. The engine consults this in `pick_best_field`.
- `compliance`: declarative classification rules. The Phase 1 engine ships the `orphaned` rule (no MDM source) as the default; richer rules land in Phase 2.

The correlation engine reads this file at startup via `loadCorrelationConfig` (`packages/core/src/correlate/config.ts`). An empty `{}` or a missing file falls back to the package's ship default (`DEFAULT_CORRELATION_CONFIG` in the same module), so a fresh install works without operator action.

In a later phase the file moves into the database and an ops-facing UI edits it. The engine reads the same validated shape either way.
