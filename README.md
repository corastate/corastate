# Corastate

Open-core device health aggregation engine. Reads from the endpoint security and MDM tools you already pay for, correlates devices across those tools, ties identities to devices, and surfaces the gaps. Read-only in v1.

## What this is

Your IT director knows there are 1247 employees and roughly 1500 endpoints. The CrowdStrike console shows 1389 agents. Intune shows 1102 devices. Okta lists 1247 humans with active sessions in the last 30 days. Jamf shows 612 Macs. Three of those four numbers are wrong, and you have no idea which three until audit week, when someone asks why the laptop assigned to a contractor who left in February is still phoning home from a coffee shop in Lisbon.

The mid-market between roughly 250 and 2500 employees has no good answer. Axonius and Tanium start north of $50K and assume a security engineering team. Fleet plus bash is the floor. Kolide sat in the middle and people liked it, and since the 1Password acquisition that gap has reopened. Corastate fills it with a deliberately small surface: five connectors for v1, shipped well. Correlation and gap detection are the product.

## The two layers

Corastate has two layers with different rules. **Connectors are code; correlation rules are config.**

The connector layer talks to vendor APIs: authentication, pagination, rate limits, and reshaping vendor JSON into the canonical schema. That work is code-shaped — branches, retries, vendor quirks no fixed vocabulary captures cleanly. Each connector is a small package, segmented into an auth piece, a fetch+pagination piece, and a mapping piece, built by composing reviewed strategies from a named-strategy registry in `packages/connector-sdk`.

The correlation layer reads the observation log and decides which observations describe the same physical device, which source wins when two sources disagree, and whether a device counts as compliant. That work is config-shaped — a small set of declarative rules an ops lead can tune without a release. The rules live in `configs/correlation.json`, validated at boot against `correlationConfigSchema` in `packages/contracts`.

The boundary between the two layers is the observation log: connectors write observations, the correlation engine reads them, and neither knows how the other is built.

**The authoritative architecture document is [`architecture-v3.md`](https://corastate.com/architecture-v3) (also at `~/Downloads/architecture-v3.md` for contributors).** Read it before changing connector or schema shape; the two load-bearing decisions are the observation-log data model and the segmented code-first connector model.

## Status

**Phase 1 in progress.** This commit is the structural scaffold aligned to architecture-v3. Real feature implementation lands across four sprint weeks per [`phase-1-sprint-plan-v3.md`](https://corastate.com/phase-1-sprint-plan-v3).

What is in the tree today:

- pnpm workspace: backend, web, CLI, contracts, db, core, connector-sdk, and five connector packages (okta + four skeletons).
- `packages/contracts`: Zod canonical schema for `Device` and `Identity`, the correlation-config shape, and the API request/response shapes.
- `packages/connector-sdk`: segmented connector skeleton (`defineConnector`, `Connector`, `ConnectorAuth`, `ConnectorFetch`, `ConnectorMapping`) and the named-strategy registry (`AuthStrategy`, `PaginationStrategy`, `NamedStrategyRegistry`).
- `packages/connector-okta` + `packages/connector-defender` + scaffolded skeletons for CrowdStrike, Intune, Jamf — each laid out as `auth.ts` / `fetch.ts` / `mapping.ts` / `index.ts`. Stubs only; mapping bodies throw NotImplemented until the corresponding sprint week.
- `packages/db`: Drizzle schema with `observations`, `entities`, `sync_runs`, plus the credential layer (`credentials`, `key_versions`, `credential_access_audit`).
- `packages/core`: the `KeyProvider` interface with `EnvKeyProvider` (the only Phase 1 implementation per architecture-v3).
- `apps/backend`: Fastify split into `/v1` (stable, will be public) and `/internal` (unversioned, frontend-only) namespaces, healthz stubs only.
- `apps/web`: React + Vite + Tailwind + shadcn shell, polling `/internal/healthz` to prove the wire.
- `apps/cli`: `migrate`, `sync`, `diagnose` commands (placeholders until Week 2).
- `configs/correlation.json`: empty placeholder, populated Week 3.

What does not work yet (intentionally — comes in the Phase 1 sprint):

- The sync runner. Connectors are scaffolded; no records flow through them.
- The correlation engine. Schema and config shape are pinned; the engine lands Week 3.
- The credential store helpers (envelope encryption, audit writer, OAuth lifecycle). Schema is locked from this commit; implementations land Week 1.
- Real `/v1/devices` and `/v1/identities` endpoints. Stubs only.
- The partition conversion for the observations table.

## The 30-minute walkthrough (will work at v0.1.0)

This walkthrough lands at the end of Phase 1 Week 4. The structural scaffold below boots; it does not yet show correlated data.

### Prerequisites

- Node.js 20.11 or newer (mise / nvm / volta all fine)
- pnpm 10 or newer
- Docker (Docker Desktop, OrbStack, or any container runtime that speaks `docker compose`)

### Step 1. Install

```sh
pnpm install
```

### Step 2. Bring up Postgres

```sh
cp .env.example .env
docker compose up -d
```

Two services come up:

- Postgres on `localhost:5432`, user `corastate`, password `corastate`, database `corastate`.
- Adminer on `http://localhost:8081` for browsing the database in a UI.

### Step 3. Apply migrations

```sh
pnpm db:generate   # writes drizzle/0000_*.sql from the Drizzle schema
pnpm migrate       # applies migrations + creates the current_state materialized view
```

### Step 4. Run the apps

```sh
pnpm dev
```

The backend serves at `http://localhost:4000`, the web app at `http://localhost:5173`. Vite proxies `/v1/*` and `/internal/*` through to the backend so CORS is not in play in dev.

Verify:

- `curl localhost:4000/v1/healthz` → `{"status":"ok","uptime":N,"db":"ok"}`
- `curl localhost:4000/internal/healthz` → same shape
- `http://localhost:5173/` in a browser renders the system-health card

Adminer at `http://localhost:8081` shows three observation-log tables (`observations`, `entities`, `sync_runs`), three credential-layer tables (`credentials`, `key_versions`, `credential_access_audit`), and one materialized view (`current_state`).

### Tearing down

```sh
docker compose down            # stops the containers, keeps the data
docker compose down -v         # stops and wipes the postgres volume
```

## Deployment topology

Two shapes, same application, no code paths branch on the deployment.

- **Local + self-hosted** (Phase 1 target). Docker Compose brings up Postgres, the API process, the sync worker, and the web app. The master key comes from a `.env` file.
- **AWS production** (later phase). A Terraform module stands up the same processes on ECS Fargate with Postgres on RDS, the master key coming from an ECS task secret.

The `KeyProvider` reads `process.env` either way. Postgres is Postgres. The container image is the same image.

## Connectors

| Name                    | Status                  | License      | Auth strategy            | Pagination strategy |
| ----------------------- | ----------------------- | ------------ | ------------------------ | ------------------- |
| Okta                    | Skeleton — Week 2       | Apache-2.0\* | `staticToken`            | `linkHeader`        |
| Microsoft Defender      | Skeleton — Week 3       | Apache-2.0   | `oauthClientCredentials` | `odataNextLink`     |
| CrowdStrike Falcon      | Scaffold, not authored  | Commercial   | `oauthClientCredentials` | `cursorParam`       |
| Microsoft Intune        | Scaffold, not authored  | Commercial   | `oauthClientCredentials` | `odataNextLink`     |
| Jamf Pro                | Scaffold, not authored  | Commercial   | `oauthClientCredentials` | `pageNumber`        |

\* The Okta connector lives in the open source tree because the Okta tier we need is free.

Only Okta and Defender are proven end to end in Phase 1; the other three are scaffolded skeletons that show the shape without claiming to work.

## License

Apache 2.0. See `LICENSE`. Commercial connectors will live in a separate package under a source-available license; the boundary is enforced by the connector framework, not license trickery.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). Short version: open a discussion before authoring a new connector, because the segmented skeleton has hard shape constraints (architecture-v3 §"How the Phase 3 AI companion fits") and a misshapen connector PR is hard to redirect.
