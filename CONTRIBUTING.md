# Contributing to Corastate

Thanks for the interest. The project is small and the v1 surface is still moving, so the most useful thing you can do today is talk to me before you write code.

## Where to start

- **Issues labeled `good first issue`** are small, scoped, and have an obvious right answer. These are safe to grab without a conversation first.
- **Anything else.** Open a GitHub Discussion or email me first. The architecture is opinionated and a few of the obvious-looking ideas are deliberate cuts. A two-line message saves both of us a week.

## What helps right now

The roadmap, in priority order:

1. Reference connector for Microsoft Defender for Endpoint. End-to-end test that the framework can ingest from a real vendor.
2. The correlation engine in `packages/core/src/correlate.ts`. The matching strategy is sketched in the source; an implementation against synthetic data is welcome.
3. The partition conversion migration for the observations table. Spec is in the architecture doc; the work is one SQL file in `packages/db/drizzle/`.
4. Connector tests. Vitest plus a recorded-fixtures HTTP layer is probably the right shape.

## What does not help right now

- A second commercial connector before Defender works.
- A rules engine or remediation. v1 is read-only on purpose.
- A rewrite of the observation log into current-state tables. Read the architecture doc first; that decision is load-bearing.

## Style

- Plain words. No marketing voice in code, comments, or commit messages.
- No `console.log` in app code (the lint rule will catch it). The CLI is allowed.
- Imports use `.js` extensions for local files (Node ESM convention) even though the files are `.ts`.
- Prettier and ESLint run in CI. `pnpm format` and `pnpm lint` locally before opening a PR.

## Tests

`pnpm test` runs Vitest across the workspace. New code should come with tests when the thing being added has a clear contract; framework plumbing without a contract yet can land without.

## License

By contributing you agree your contribution is licensed under Apache 2.0 (matching the repo). If you cannot make that agreement for a particular contribution, say so in the PR.
