# Claude skills installed in this repo

This is a Claude-facing index. Engineer-facing frontend rules live in [`apps/web/FRONTEND.md`](../apps/web/FRONTEND.md).

The seven skills under [`.claude/skills/`](./skills/) are loaded automatically when Claude Code runs inside this repo. Each skill's `description:` frontmatter governs when it auto-triggers — Claude reads them on startup and activates the relevant one based on the task. Nothing here needs to be invoked manually.

## Catalog

| Skill                                                           | Auto-triggers on                                                                                                                                              |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`web-design-guidelines`](./skills/web-design-guidelines/)      | "review my UI", "check accessibility", "audit design", "review UX", "check against best practices"                                                            |
| [`vercel-react-best-practices`](./skills/react-best-practices/) | Writing, reviewing, or refactoring React code; data fetching, bundle optimization, performance work                                                           |
| [`vercel-composition-patterns`](./skills/composition-patterns/) | Boolean-prop proliferation, building reusable APIs, compound components, render props, context providers, component architecture (incl. React 19 API changes) |
| [`webapp-testing`](./skills/webapp-testing/)                    | Testing local web apps with Playwright — screenshots, browser logs, UI behavior                                                                               |
| [`skill-creator`](./skills/skill-creator/)                      | Creating, editing, or optimizing a Claude skill; running evals                                                                                                |
| [`claude-api`](./skills/claude-api/)                            | Code imports `anthropic` / `@anthropic-ai/sdk`; questions about prompt caching, thinking, tool use, batch, files, citations, or model migration               |
| [`mcp-builder`](./skills/mcp-builder/)                          | Building MCP servers in Python (FastMCP) or TypeScript (MCP SDK) for external services                                                                        |

## How the UI skills layer

When more than one would match, prefer this routing:

- **New component shape** → `vercel-composition-patterns`. It owns "should this be a compound component, a context, a render prop, an explicit variant".
- **Performance / slow render / waterfall / bundle bloat** → `vercel-react-best-practices`. Has ~80 rule files under [`./skills/react-best-practices/rules/`](./skills/react-best-practices/rules/) grouped by waterfalls, bundle, server, client, rerender, rendering, JS perf, advanced.
- **Holistic UI / a11y / "does this feel right" pass** → `web-design-guidelines`. Fetches the live Vercel Web Interface Guidelines from GitHub and applies them as a checklist.

These overlap on edges; pick by the user's framing, not by guessing what they "really" mean.

## Testing skill is latent

`webapp-testing` is installed but inert: no `apps/web/tests/` directory exists yet and no Playwright config is wired. The Week 4 sprint adds it — see [`apps/web/FRONTEND.md`](../apps/web/FRONTEND.md) "Testing approach". When that lands, this skill activates automatically.

## Meta-skill applicability in Corastate today

- **`claude-api`** — inactive. Corastate has no `@anthropic-ai/sdk` imports in product code. Reactivate at Phase 3 if the AI companion calls Claude directly.
- **`mcp-builder`** — inactive. We are not exposing Corastate over MCP. Revisit if a customer or partner asks for an MCP surface to the canonical schema.
- **`skill-creator`** — use after Week 4 ships, once concrete Corastate-specific patterns (correlation-tuning rituals, connector-authoring checklist, observation-log conventions) are stable enough to encode as a custom skill.

## Updating the skills

The skills are checked-in copies, not submodules. To refresh a skill to a newer upstream version: re-clone the source repo (anthropics/skills or vercel-labs/agent-skills) to `/tmp`, `cp -r` the updated skill directory over `.claude/skills/<name>/`, commit. The two install commits are `637d621` (Vercel skills) and `2e9db07` (Anthropic skills) for reference.
