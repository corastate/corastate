# Corastate

Open-core device health aggregation. Reads from the endpoint security and MDM tools you already pay for, correlates devices across those tools, ties identities to devices, and surfaces the gaps. Read-only in v1.

## The problem

Your IT director knows there are 1247 employees and roughly 1500 endpoints. The CrowdStrike console shows 1389 agents. Intune shows 1102 devices. Okta lists 1247 humans with active sessions in the last 30 days. Jamf shows 612 Macs. Three of those four numbers are wrong, and you have no idea which three until audit week, when someone asks why the laptop assigned to a contractor who left in February is still phoning home from a coffee shop in Lisbon.

The mid-market between roughly 250 and 2500 employees has no good answer. Axonius and Tanium start north of $50K and assume a security engineering team. Fleet plus bash is the floor. Kolide sat in the middle and people liked it; since the 1Password acquisition that gap has reopened. Corastate fills it with a deliberately small surface: five connectors for v1, shipped well. Correlation and gap detection are the product.

## Run it locally

The entire stack runs in Docker. Postgres, the migrations, the seed data, the backend, the worker, and the web UI come up together from one command.

### Prerequisites

- Docker (Docker Desktop, OrbStack, or any runtime that speaks `docker compose`)

That is it. Node and pnpm are only needed if you want to develop against the code rather than just run it.

### One command

```sh
git clone https://github.com/llort-red/corastate.git
cd corastate
docker compose up --build
```

First build takes 2 to 4 minutes depending on your Docker cache. Subsequent runs are seconds.

When the logs settle, open **http://localhost:5173**. The Devices view loads with 30 correlated devices, the Identities view with 20 people, and the Sources view shows the two demo sources as `succeeded`. The Overview dashboard rolls it all up. No accounts, no API keys, no manual seed step.

To tear down:

```sh
docker compose down            # stop containers, keep the data
docker compose down -v         # stop and wipe the postgres volume
```

### What just happened

`docker compose up` brings up six services:

| Service    | Role                                                                |
| ---------- | ------------------------------------------------------------------- |
| `postgres` | Postgres 16.                                                        |
| `migrate`  | Runs Drizzle migrations, rolls partitions, materializes the view. Exits. |
| `seed`     | Loads 20 identities and 30 devices into a demo Okta and Defender source. Exits. |
| `backend`  | Fastify API on `:4000`, serves `/v1/*` and `/internal/*`.           |
| `worker`   | Sync runner with the master key. The demo sources are inactive so it idles. |
| `web`      | nginx serving the SPA on `:5173`, proxies `/v1` and `/internal` to backend. |

`migrate` and `seed` are one-shot init containers. `backend`, `worker`, and `web` only start once they have completed, so the API can never serve a request against an unmigrated or empty database.

### Useful URLs once it is up

- http://localhost:5173 web UI
- http://localhost:4000/v1/devices?limit=3 API
- http://localhost:4000/internal/healthz backend health probe
- http://localhost:8081 Adminer (Postgres web UI), if started with `docker compose --profile tools up`

### Verifying with curl

```sh
curl -s http://localhost:4000/v1/devices?limit=3 | jq '.items[0]'
curl -s http://localhost:4000/v1/sources       | jq .
curl -s http://localhost:4000/internal/healthz | jq .
```

## Two ways to develop against it

The compose stack above runs the published image of the code in the repo. If you want to edit the code and see changes live, run the apps as Node processes against the dockerized Postgres.

### Plain `.env`

```sh
docker compose up -d postgres          # start just Postgres
cp .env.example .env                   # plain values, demo master key
pnpm install
pnpm migrate
pnpm seed
pnpm dev                               # backend + web + worker, hot reload
```

`.env.example` is committed and contains literal placeholder values, including a demo-grade master key. Replace the master key if the install will hold real vendor credentials.

### 1Password (the maintainer's setup)

If you keep dev secrets in 1Password, the same `pnpm dev` flow works through `op run`:

```sh
op run --env-file=.env.local -- pnpm dev
```

`.env.local` is gitignored and holds `op://...` references. Both paths target the same env vars; only the source differs.

## What v1 does

- Polls Okta and Microsoft Defender on a schedule, pulls users and devices, normalizes them into the canonical schema.
- Correlates per-source observations into one canonical device per physical box, using rules from `configs/correlation.json`.
- Surfaces four read-only views in the web UI: **Overview** (KPIs and gaps), **Devices** (with source pills, health flags, missing-from gaps), **Identities** (with device counts), **Sources** (with last-sync time and status).
- Exposes the same data on a stable `/v1/*` HTTP API.

## What v1 does NOT do

- No write actions, no remediation. Read-only.
- No remediation prompts, ticket creation, or webhooks to external tools.
- No correlation-editing UI. Match keys and source priorities live in `configs/correlation.json` and reload on worker restart.
- No commercial connectors (CrowdStrike, Intune, Jamf). The packages are scaffolded but the mapping bodies throw `NotImplemented`. Those land in a separate source-available tier.
- No multi-tenant isolation. Single-tenant installs only; one Postgres database per company.
- No AWS Terraform module. The deployment path today is `docker compose up`; the production module lands in Phase 3.

## The two layers

Corastate has two layers with different rules. **Connectors are code; correlation rules are config.**

The connector layer talks to vendor APIs: authentication, pagination, rate limits, and reshaping vendor JSON into the canonical schema. That work is code-shaped, with branches, retries, and vendor quirks no fixed vocabulary captures cleanly. Each connector is a small package, segmented into an auth piece, a fetch + pagination piece, and a mapping piece, built by composing reviewed strategies from a named-strategy registry in `packages/connector-sdk`.

The correlation layer reads the observation log and decides which observations describe the same physical device, which source wins when two sources disagree, and whether a device counts as compliant. That work is config-shaped, a small set of declarative rules an ops lead can tune without a release. The rules live in `configs/correlation.json`, validated at boot against `correlationConfigSchema` in `packages/contracts`.

The boundary between the two layers is the observation log: connectors write observations, the correlation engine reads them, and neither knows how the other is built.

**The authoritative architecture document is [`architecture-v3.md`](https://corastate.com/architecture-v3).** Read it before changing connector or schema shape; the two load-bearing decisions are the observation-log data model and the segmented code-first connector model.

## Architecture in one paragraph

The web app and the Fastify backend share the `packages/contracts` Zod schemas; every API response is validated on both sides. The backend reads from the database, never from a connector directly. The sync worker is the only process holding the master key; it polls active sources, runs each connector's `runSync` against the observation log, and after every batch the correlation engine collapses cross-source observations into `canonical_devices` by configured match keys. The CLI offers operator commands (`migrate`, `seed`, `sync`, `diagnose`). See `architecture-v3.md` for the full picture and the load-bearing decisions.

## Deployment topology

Two shapes, same application, no code paths branch on the deployment.

- **Local + self-hosted** (Phase 1 target). Docker Compose brings up Postgres; backend, worker, and web run as containers (or as Node processes for the dev loop). The master key comes from an env var.
- **AWS production** (Phase 3). A Terraform module stands up the same processes on ECS Fargate with Postgres on RDS, the master key coming from an ECS task secret.

The `KeyProvider` reads `process.env` either way. Postgres is Postgres. The container image is the same image.

## Connectors

| Name                    | Status                  | License      | Auth strategy            | Pagination strategy |
| ----------------------- | ----------------------- | ------------ | ------------------------ | ------------------- |
| Okta                    | Authored (Phase 1)      | Apache-2.0\* | `staticToken`            | `linkHeader`        |
| Microsoft Defender      | Authored (Phase 1)      | Apache-2.0   | `oauthClientCredentials` | `odataNextLink`     |
| CrowdStrike Falcon      | Scaffold, not authored  | Commercial   | `oauthClientCredentials` | `cursorParam`       |
| Microsoft Intune        | Scaffold, not authored  | Commercial   | `oauthClientCredentials` | `odataNextLink`     |
| Jamf Pro                | Scaffold, not authored  | Commercial   | `oauthClientCredentials` | `pageNumber`        |

\* The Okta connector lives in the open source tree because the Okta tier needed is free.

Only Okta and Defender are proven end to end in Phase 1; the other three are scaffolded skeletons that show the shape without claiming to work. Real CrowdStrike, Intune, and Jamf land in a separate commercial tier.

## Where the interesting code lives

```
apps/
  backend/     Fastify API (/v1, /internal)
  web/         React + Vite + Tailwind + shadcn SPA
  worker/      Polling sync runner, only process with the master key
  cli/         Operator CLI: migrate, seed, sync, diagnose
packages/
  contracts/   Zod canonical schema (Device, Identity, API shapes)
  connector-sdk/         defineConnector + named strategy registry
  connector-okta/        Authored
  connector-defender/    Authored
  connector-crowdstrike, connector-intune, connector-jamf/  Scaffolds
  core/        Sync runner, correlation engine, observation writer, secrets
  db/          Drizzle schema + migrate runner + partition roll
configs/
  correlation.json       Match keys, source priorities, compliance rules
docker/
  nginx.conf             Web container nginx config (SPA + API proxy)
```

A few entry points worth opening first if you are reviewing the code:

- `packages/core/src/correlate/`, the correlation engine. Config-driven, tested.
- `packages/connector-sdk/src/`, the named-strategy registry and `defineConnector` shape.
- `packages/connector-defender/src/`, a real connector end to end, ~150 lines.
- `apps/backend/src/routes/v1.ts`, every `/v1/*` route shape and where it pulls from.
- `apps/worker/src/index.ts`, the polling loop, including the boot-time master-key check.

## CI

GitHub Actions runs lint, typecheck, vitest against a real Postgres service container, and a build smoke. See `.github/workflows/ci.yml`. The test job mirrors the local setup: `cp .env.example .env`, generate a master key, `pnpm migrate`, `pnpm test`.

## License

Apache 2.0. See `LICENSE`. Commercial connectors will live in a separate package under a source-available license; the boundary is enforced by the connector framework, not license trickery.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). Short version: open a discussion before authoring a new connector. The segmented skeleton has hard shape constraints and a misshapen connector PR is hard to redirect.
