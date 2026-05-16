# configs/

This directory holds the **correlation layer** (config), separate from the connector layer (code). See architecture-v3.md §"Two layers with different rules".

## correlation.json

Match keys, source priority, and compliance rules consumed by the correlation engine. Validated at boot against `correlationConfigSchema` from `@corastate/contracts`; the loader fails loudly on a malformed config.

Phase 1 ships an empty `{}` placeholder. The Week 3 plan populates it with:

- `matchPriority`: ordered list of match keys, ported from the prototype (serial → azureAdDeviceId → hostname → macAddresses).
- `sourcePriority`: per canonical field, ordered list of source ids for tie-break.
- `compliance`: declarative classification rules.

In a later phase the file moves into the database and an ops-facing UI edits it. The engine reads the same validated shape either way.
