# Frontend conventions

Engineer-facing rules for [`apps/web/`](./), curated from the Claude skills installed under [`.claude/skills/`](../../.claude/skills/) and tailored to Corastate's stack. The Claude-facing index of those skills lives in [`.claude/SKILLS.md`](../../.claude/SKILLS.md).

Week 4 has shipped: TanStack Query is in, the three product views render, and Playwright smoke tests boot the stack and assert each view. The rules below stay forward-looking; the Week-2 shell audit further down is preserved as a frozen reference for what the diagnostic-only shell looked like.

## Stack baseline

- **React 18.3** + **Vite 5.4** SPA (not Next.js — see "Out of scope" below).
- **Tailwind 3.4** with dark-mode via `class` strategy. Design tokens are HSL CSS variables in [`src/index.css`](./src/index.css) (e.g. `--background`, `--primary`, `--destructive`).
- **shadcn-style** components under [`src/components/ui/`](./src/components/ui/) — copied in rather than installed, per shadcn convention. `Button` and `Card` (compound) live there today.
- **Radix UI** (`@radix-ui/react-slot`) for primitives, **Lucide React** for icons, **`class-variance-authority`** + the `cn()` helper in [`src/lib/utils.ts`](./src/lib/utils.ts) for variant management.
- **No data-fetching library yet.** See "Data fetching" below — the decision is pending and is the single most important pre-Week-4 call.
- API proxy: `/v1/*` and `/internal/*` route to the backend per [`vite.config.ts`](./vite.config.ts), configurable via `VITE_API_BASE_URL`.

## Rules to apply going forward

### Composition (apply now while components are few)

The `vercel-composition-patterns` skill ([`.claude/skills/composition-patterns/rules/`](../../.claude/skills/composition-patterns/rules/)) governs new component shape. The three rules to internalise before adding any new primitive:

- **No boolean-prop creep.** If you find yourself adding `isLoading`, `hasError`, `withFooter`, `variant`, and `size` as separate booleans, stop and either use explicit variants (CVA, as `Button` does) or split into a compound component (as `Card` does — see [`src/components/ui/card.tsx`](./src/components/ui/card.tsx)). Rules: `architecture-avoid-boolean-props`, `patterns-explicit-variants`.
- **Compound components for nested structure.** [`Card` / `CardHeader` / `CardTitle` / `CardDescription` / `CardContent` / `CardFooter`](./src/components/ui/card.tsx) is the exemplar — reuse this shape for `DeviceRow`, `IdentityPanel`, and anything else that holds named slots. Rule: `architecture-compound-components`.
- **Children > render props.** Prefer `<Thing>{slot}</Thing>` over `<Thing render={...}>`. Rule: `patterns-children-over-render-props`.

React 19 is not yet in use — `forwardRef` is still required by our React 18 components. When we upgrade, see `react19-no-forwardref`.

### Data fetching

**TanStack Query.** Decision shipped Week 4. The provider is wired in [`src/main.tsx`](./src/main.tsx), the typed fetchers + `queryOptions` factories live in [`src/lib/api.ts`](./src/lib/api.ts), and the three product views consume them via `useQuery`. Adding a new view: write the fetcher, expose a `queryOptions` factory next to it, call `useQuery(myThingQuery(params))` in the view.

Alternatives considered before the call: SWR (lighter but weaker mutation story for connector-status writes later), raw `useSyncExternalStore` wrappers (full control but reinvents caching and dedup). The `vercel-react-best-practices` rules `async-parallel`, `client-swr-dedup`, `async-cheap-condition-before-await`, and `async-defer-await` motivated the move off the manual `useState` + `useEffect` pattern.

Do not introduce a parallel data-fetching primitive for product views. The diagnostic Health view originally polled `/internal/healthz` with `useState` + `useEffect` and was migrated alongside; new diagnostic surfaces should follow suit.

### Re-render hygiene (applies once lists exist)

The `rerender-*` rule family in [`.claude/skills/react-best-practices/rules/`](../../.claude/skills/react-best-practices/rules/) has ~25 rules. The three that will bite first when device/identity lists land:

- **`rerender-no-inline-components`** — never define a component inside another component's render. Hoist it.
- **`rerender-derived-state-no-effect`** — if a value can be derived from props/state, compute it inline; do not `useEffect` to mirror it.
- **`rerender-functional-setstate`** — when next state depends on previous state, use `setX(prev => ...)`, not `setX(x + 1)`.

The full rule list is worth a scan when you wire up the first list view.

### Bundle hygiene (enforce up front, cheap)

Only one rule worth enforcing on day one:

- **`bundle-barrel-imports`** — never `import { Foo } from '@radix-ui/react-...'` from a barrel. Use the specific entrypoint. Same for Lucide (`import { Server } from 'lucide-react'` is fine — Lucide is tree-shakeable — but watch for any new icon library). The skill's full bundle-\* group is worth re-reading at the first measurable load-time regression.

## Testing approach

Playwright is wired. Config in [`playwright.config.ts`](./playwright.config.ts) (boots backend + web via `webServer`), tests in [`tests/smoke.spec.ts`](./tests/smoke.spec.ts). Run via `pnpm test:ui` from any directory.

The current suite is deliberately thin: each view renders, navigation works, the API contract isn't broken. Pagination, search, and the empty states are uncovered today; add coverage when those flows start hosting load-bearing behaviour, not pre-emptively.

The Vitest unit-test directory under `src/` is empty; component unit tests should sit beside the component they cover when they exist.

## Shell audit — Week 2 snapshot

Frozen on the date of this commit. Becomes stale at Week 4 start.

- ✅ **Design tokens** — HSL CSS variables in [`src/index.css`](./src/index.css), Tailwind palette extending them in [`tailwind.config.js`](./tailwind.config.js). Keep; do not regress to hard-coded colours.
- ✅ **Compound components** — [`Card`](./src/components/ui/card.tsx) is the exemplar; the `Button` CVA shape in [`./src/components/ui/button.tsx`](./src/components/ui/button.tsx) is the variant-system exemplar. Reuse both for new primitives.
- ✅ **ErrorBoundary** — wraps `<App />` in [`src/main.tsx`](./src/main.tsx) as of this commit. Source: [`src/components/ErrorBoundary.tsx`](./src/components/ErrorBoundary.tsx). Fallback uses the shadcn `Card` primitives so the visual language is consistent with the rest of the shell.
- ⚠️ **`idle` and `loading` states render identical text** in [`src/App.tsx:58-61`](./src/App.tsx). Cosmetic; defer to Week 4 polish when real loading skeletons replace text.
- ℹ️ **`useState` + `useEffect` data-fetching pattern** in [`src/App.tsx:24-41`](./src/App.tsx) — acceptable for the `/internal/healthz` probe. Do **not** propagate to product views. Action item 1 picks the library.
- ℹ️ **No error reporter, no analytics, no console capture** — by design at Phase 1. The ErrorBoundary deliberately does not log to a backend yet; React's default behaviour already surfaces stack traces in dev. Revisit when product views ship.
- ℹ️ **No retry/backoff on fetch errors** — the header "Refresh" button is the entire retry surface today. Sufficient for one diagnostic endpoint; not sufficient for product views.

## Action items (status)

1. ✅ **Pick a data-fetching library before Week 4 starts.** TanStack Query landed Week 4. See "Data fetching" above.
2. ✅ **Scaffold Playwright at Week 4 start.** `apps/web/playwright.config.ts` + `apps/web/tests/smoke.spec.ts` run via `pnpm test:ui`. The `@playwright/test` runner replaces the `with_server.py` shape that the webapp-testing skill suggests; `webServer` in the config gives the same end-to-end lifecycle without the Python bridge.
3. ⏳ **Audit ESLint config against `vercel-react-best-practices` lint-encodable rules.** Several can be enforced statically: `rerender-no-inline-components` (custom rule), `bundle-barrel-imports` (`eslint-plugin-import` `no-restricted-imports`), various `js-*` rules. Open a tracking issue at Phase 2 start.
4. ⏳ **Revisit `claude-api` and `mcp-builder` skill applicability at Phase 1 close.** If Phase 3's AI companion implies Anthropic SDK use in product, the `claude-api` skill activates. If Corastate exposes MCP, `mcp-builder` activates. Neither applies today.

## Out of scope

This document does **not** prescribe:

- A specific Next.js migration path — Corastate is a Vite SPA on purpose. Server-side rules in `vercel-react-best-practices` (the `server-*` family) do not apply.
- Analytics, error tracking, or RUM — Phase 1 ships without them.
- A component library beyond shadcn copy-ins — installable libraries (Mantine, MUI, etc.) are not under consideration.
- React Native / React 19 / view transitions — separate skills exist for those if they become relevant later.
