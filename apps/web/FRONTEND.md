# Frontend conventions

Engineer-facing rules for [`apps/web/`](./), curated from the Claude skills installed under [`.claude/skills/`](../../.claude/skills/) and tailored to Corastate's stack. The Claude-facing index of those skills lives in [`.claude/SKILLS.md`](../../.claude/SKILLS.md).

This document has two halves: forward-looking rules to apply when Week 4 product views land, and a frozen audit of the **Week 2 shell** that becomes stale the moment real `/v1/devices` and `/v1/identities` views start landing. Treat the audit as a snapshot, not a living document.

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

### Data fetching (decide before Week 4)

The shell's manual `useState` + `useEffect` + try/catch pattern in [`src/App.tsx:22-41`](./src/App.tsx) is acceptable **only** for `/internal/*` diagnostic surfaces. Product views (`/v1/devices`, `/v1/identities`) need parallelisation, request dedup, retry, and cache — all of which `vercel-react-best-practices` calls out as critical (see rules `async-parallel`, `client-swr-dedup`, `async-cheap-condition-before-await`, `async-defer-await`).

**Recommended:** [**TanStack Query**](https://tanstack.com/query/latest). It matches the skill's parallel/dedup/cache rules without locking us into Next.js-specific patterns (RSC, `cache()`, server actions) that don't exist in a Vite SPA. Alternatives considered: SWR (lighter, but weaker mutation story for connector-status writes later), raw `useSyncExternalStore` wrappers (full control, but reinvents caching and dedup).

Whatever the choice, do **not** propagate the `useState` + `useEffect` pattern to product views. Pick the library, write one example fetch, and convert at the start of Week 4.

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

The [`webapp-testing`](../../.claude/skills/webapp-testing/) skill provides a Playwright-based harness with a black-box server-lifecycle script (`scripts/with_server.py`). It is **latent today** — no `apps/web/tests/` directory, no Playwright config.

Scaffold under `apps/web/tests/` at the **start of Week 4**, not now: there is exactly one screen and one state worth testing today, and webapp-testing's reconnaissance-then-action pattern is overkill for it. The skill activates automatically the moment a Playwright config exists.

## Shell audit — Week 2 snapshot

Frozen on the date of this commit. Becomes stale at Week 4 start.

- ✅ **Design tokens** — HSL CSS variables in [`src/index.css`](./src/index.css), Tailwind palette extending them in [`tailwind.config.js`](./tailwind.config.js). Keep; do not regress to hard-coded colours.
- ✅ **Compound components** — [`Card`](./src/components/ui/card.tsx) is the exemplar; the `Button` CVA shape in [`./src/components/ui/button.tsx`](./src/components/ui/button.tsx) is the variant-system exemplar. Reuse both for new primitives.
- ✅ **ErrorBoundary** — wraps `<App />` in [`src/main.tsx`](./src/main.tsx) as of this commit. Source: [`src/components/ErrorBoundary.tsx`](./src/components/ErrorBoundary.tsx). Fallback uses the shadcn `Card` primitives so the visual language is consistent with the rest of the shell.
- ⚠️ **`idle` and `loading` states render identical text** in [`src/App.tsx:58-61`](./src/App.tsx). Cosmetic; defer to Week 4 polish when real loading skeletons replace text.
- ℹ️ **`useState` + `useEffect` data-fetching pattern** in [`src/App.tsx:24-41`](./src/App.tsx) — acceptable for the `/internal/healthz` probe. Do **not** propagate to product views. Action item 1 picks the library.
- ℹ️ **No error reporter, no analytics, no console capture** — by design at Phase 1. The ErrorBoundary deliberately does not log to a backend yet; React's default behaviour already surfaces stack traces in dev. Revisit when product views ship.
- ℹ️ **No retry/backoff on fetch errors** — the header "Refresh" button is the entire retry surface today. Sufficient for one diagnostic endpoint; not sufficient for product views.

## Action items (deferred, surfaced)

1. **Pick a data-fetching library before Week 4 starts.** Recommend TanStack Query; the comparison is in "Data fetching" above. Decision affects every `/v1/*` view and should land as a one-PR baseline before any view code.
2. **Scaffold Playwright at Week 4 start**, not earlier. Use the `webapp-testing` skill's `scripts/with_server.py` as the runner; first test should be the device-list happy path.
3. **Audit ESLint config against `vercel-react-best-practices` lint-encodable rules.** Several can be enforced statically: `rerender-no-inline-components` (custom rule), `bundle-barrel-imports` (`eslint-plugin-import` `no-restricted-imports`), various `js-*` rules. Open a tracking issue when Week 3 lands and the connector surface stops moving.
4. **Revisit `claude-api` and `mcp-builder` skill applicability at Phase 1 close.** If Phase 3's AI companion implies Anthropic SDK use in product, the `claude-api` skill activates. If we expose Corastate over MCP, `mcp-builder` activates. Neither applies today.

## Out of scope

This document does **not** prescribe:

- A specific Next.js migration path — Corastate is a Vite SPA on purpose. Server-side rules in `vercel-react-best-practices` (the `server-*` family) do not apply.
- Analytics, error tracking, or RUM — Phase 1 ships without them.
- A component library beyond shadcn copy-ins — installable libraries (Mantine, MUI, etc.) are not under consideration.
- React Native / React 19 / view transitions — separate skills exist for those if they become relevant later.
