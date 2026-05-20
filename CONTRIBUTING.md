# Contributing to Corastate

Thanks for the interest. The project is small and the v1 surface is still moving, so the most useful thing you can do today is talk to me before you write code.

The architecture is locked in [`architecture-v3.md`](https://corastate.com/architecture-v3). Read it before opening a PR that touches connector shape, the credential store, the API namespace split, or the canonical schema. The four-week sprint plan is [`phase-1-sprint-plan-v3.md`](https://corastate.com/phase-1-sprint-plan-v3).

## Where to start

- **Issues labeled `good first issue`** are small, scoped, and have an obvious right answer. Safe to grab without a conversation.
- **Anything else.** Open a GitHub Discussion or email me first. A few of the obvious-looking ideas are deliberate cuts; a two-line message saves both of us a week.

## What helps right now

Phase 1 is feature-complete: Okta and Defender connectors work end to end, correlation is wired, the three read-only views render, the Playwright smoke tests pass, and the 30-minute walkthrough is real. The honest priorities for the next sliver of work:

1. **A second authored connector beyond Defender.** Anything in `connector-crowdstrike`, `connector-intune`, or `connector-jamf` whose mapping body still throws `NotImplemented`. Open a discussion first; only Okta and Defender are reviewed for the SDK boundary today.
2. **Better Playwright coverage.** The smoke tests in `apps/web/tests/smoke.spec.ts` are deliberately thin: each view renders, nav works. Pagination, search, and the empty states are still uncovered.
3. **Vitest unit coverage.** The correlation engine has tests in `packages/core/src/correlate/*.test.ts`; the connectors and the credential store have less. New tests should sit next to the code they cover.
4. **Re-run the 30-minute walkthrough on a fresh machine** and report any step that surprised you. The walkthrough is the gate; surprises are bugs.

## What does not help right now

- A write or remediation surface. v1 is read-only; that is a deliberate cut, not an oversight.
- A correlation-editing UI. Phase 2 work; the rules ship as `configs/correlation.json` today.
- Adding fields to the canonical schema in `packages/contracts` without a connector that needs them. Schema is the spine; it grows when a real use case forces it.
- Replacing the observation log with current-state tables. Read architecture-v3 §"The observation-log data model"; that decision is load-bearing.
- Replacing TanStack Query with anything else. The decision is recorded in `apps/web/FRONTEND.md`; redo it via a discussion, not a PR.

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
