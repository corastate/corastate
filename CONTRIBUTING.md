# Contributing to Corastate

Thanks for the interest. The project is small and the v1 surface is still moving, so the most useful thing you can do today is talk to me before you write code.

The architecture is locked in [`architecture-v3.md`](https://corastate.com/architecture-v3). Read it before opening a PR that touches connector shape, the credential store, the API namespace split, or the canonical schema. The four-week sprint plan is [`phase-1-sprint-plan-v3.md`](https://corastate.com/phase-1-sprint-plan-v3).

## Where to start

- **Issues labeled `good first issue`** are small, scoped, and have an obvious right answer. Safe to grab without a conversation.
- **Anything else.** Open a GitHub Discussion or email me first. A few of the obvious-looking ideas are deliberate cuts; a two-line message saves both of us a week.

## What helps right now

Sprint-aligned, in priority order:

1. **Reference auth + pagination strategies** in `packages/connector-sdk`: `staticToken`, `oauthClientCredentials`, `linkHeader`, `odataNextLink`. The Phase 3 AI companion will compose connectors out of these by name, so the contracts must be precise and the tests thorough.
2. **The Okta connector mapping** — the pure functions in `packages/connector-okta/src/mapping.ts`. The auth and fetch pieces already compose registry strategies; only the mapping is per-vendor.
3. **The credential store** in `packages/core/src/secrets/`: envelope encryption helpers using AES-256-GCM, the credential-access audit writer, log redaction. The schema is already locked from the first migration.
4. **The correlation engine** in `packages/core` (Week 3 work): ported from the prototype's `correlator.py`, driven by `configs/correlation.json` validated against `correlationConfigSchema`.
5. **The observations table partition conversion** — one hand-rolled SQL file in `packages/db/drizzle/` that turns the plain table into a range-partitioned one and pre-creates a window of daily partitions.

## What does not help right now

- A second commercial connector before the Defender reference works. Real connectors are how we stress-test the SDK; one is enough for now.
- Adding fields to the canonical schema in `packages/contracts` without a connector that needs them. Schema is the spine; it grows when a real use case forces it.
- A rules engine, remediation, or write actions. v1 is read-only on purpose.
- Replacing the observation log with current-state tables. Read architecture-v3 §"The observation-log data model" — that decision is load-bearing.

## Style

- Plain words. No marketing voice in code, comments, or commit messages.
- No `console.log` in app code (the lint rule will catch it). The CLI is allowed.
- Imports use `.js` extensions for local files (Node ESM convention), even though the source files are `.ts`.
- Workspace packages export from `./src/*.ts`, not `./dist/*.js`, so tsx and vite resolve them without a pre-build. `tsc -b` still emits `dist/` for typecheck and publishable packages later.
- Prettier and ESLint run in CI. `pnpm format` and `pnpm lint` locally before opening a PR.
- Frontend conventions live in [`apps/web/FRONTEND.md`](apps/web/FRONTEND.md).

## Tests

`pnpm test` runs Vitest across the workspace. New code should come with tests when the thing being added has a clear contract — mapping functions, strategy implementations, the credential store helpers, the correlation engine. Framework plumbing without a contract yet can land without.

## Authoring a new connector

The segmented skeleton is fixed (architecture-v3 §"The segmented connector skeleton"):

```
packages/connector-<source>/
  src/
    auth.ts      — selects a registry auth strategy, names secret refs
    fetch.ts     — selects a registry pagination strategy, declares endpoints
    mapping.ts   — pure functions, one per entity kind the source emits
    index.ts     — defineConnector(...) with the three pieces
  package.json
  tsconfig.json
```

Anything that does not fit this shape is a discussion before a PR. If a vendor needs a strategy the registry does not have (mTLS, request signing, token exchange), the strategy lands in `packages/connector-sdk` as a reviewed registry entry, not as code inside a connector package.

## License

By contributing you agree your contribution is licensed under Apache 2.0 (matching the repo). If you cannot make that agreement for a particular contribution, say so in the PR.
