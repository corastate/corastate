# Corastate

Open-core device health aggregation. Reads from the endpoint security and MDM tools you already pay for, correlates devices across those tools, ties identities to devices, and surfaces the gaps. Read-only in v1.

## What this is

Your IT director knows there are 1247 employees and roughly 1500 endpoints. The CrowdStrike console shows 1389 agents. Intune shows 1102 devices. Okta lists 1247 humans with active sessions in the last 30 days. Jamf shows 612 Macs. Three of those four numbers are wrong, and you have no idea which three until audit week, when someone asks why the laptop assigned to a contractor who left in February is still phoning home from a coffee shop in Lisbon.

The mid-market between roughly 250 and 2500 employees has no good answer. Axonius and Tanium start north of $50K and assume a security engineering team. Fleet plus bash is the floor. Kolide sat in the middle and people liked it, and since the 1Password acquisition that gap has reopened. Corastate fills it with a deliberately small surface: five connectors for v1, shipped well. Correlation and gap detection are the product.

## The two layers

Corastate has two layers with different rules. **Connectors are code; correlation rules are config.**

The connector layer talks to vendor APIs: authentication, pagination, rate limits, and reshaping vendor JSON into the canonical schema. That work is code-shaped, with branches, retries, and vendor quirks no fixed vocabulary captures cleanly. Each connector is a small package, segmented into an auth piece, a fetch + pagination piece, and a mapping piece, built by composing reviewed strategies from a named-strategy registry in `packages/connector-sdk`.

The correlation layer reads the observation log and decides which observations describe the same physical device, which source wins when two sources disagree, and whether a device counts as compliant. That work is config-shaped, a small set of declarative rules an ops lead can tune without a release. The rules live in `configs/correlation.json`, validated at boot against `correlationConfigSchema` in `packages/contracts`.

The boundary between the two layers is the observation log: connectors write observations, the correlation engine reads them, and neither knows how the other is built.

**The authoritative architecture document is [`architecture-v3.md`](https://corastate.com/architecture-v3).** Read it before changing connector or schema shape; the two load-bearing decisions are the observation-log data model and the segmented code-first connector model.

## What v1 does

- Polls Okta and Microsoft Defender on a schedule, pulls users and devices, normalizes them into the canonical schema.
- Correlates per-source observations into one canonical device per physical box, using rules from `configs/correlation.json`.
- Surfaces three read-only views in a web UI: **Devices** (with source pills, health flags, missing-from gaps), **Identities** (with device count), and **Sources** (with last-sync time and status).
- Exposes the same data on a stable `/v1/*` HTTP API (`/v1/devices`, `/v1/identities`, `/v1/sources`).

## What v1 does NOT do

- No write actions, no remediation. Read-only.
- No remediation prompts, ticket creation, or webhooks to external tools.
- No correlation-editing UI. Match keys and source priorities are edited in `configs/correlation.json` and reloaded on worker restart.
- No commercial connectors (CrowdStrike, Intune, Jamf). The packages are scaffolded but the mapping bodies throw `NotImplemented`. Those land in a separate source-available tier.
- No multi-tenant isolation. Single-tenant installs only; one Postgres database per company.
- No AWS Terraform module. The deployment path today is `docker compose up`; the production module lands in Phase 3.

## The 30-minute clone-to-data walkthrough

A stranger should be able to get from `git clone` to a populated UI in well under 30 minutes. On a machine with the toolchain warm and the Postgres image cached, the walkthrough is closer to **5 minutes**; on a cold machine pulling `pnpm install` (~285 packages) and `postgres:16-alpine` (~80MB), budget **15 to 20 minutes**.

The walkthrough below uses a seeded demo data set so no real Okta or Defender tenant is required.

### Prerequisites

- Node.js 20.11 or newer (mise, nvm, or volta all fine)
- pnpm 10 or newer (`corepack enable && corepack prepare pnpm@10 --activate`)
- Docker (Docker Desktop, OrbStack, or any runtime that speaks `docker compose`)

### Step 1. Install dependencies (1-3 min)

```sh
pnpm install
```

### Step 2. Bring up Postgres (5 sec to 1 min)

```sh
cp .env.example .env
docker compose up -d
```

This starts Postgres on `localhost:5432` and Adminer on `http://localhost:8081`.

The `.env` file already points at the dockerized Postgres. The credential store uses a master key for envelope-encrypted secrets; generate one and append it:

```sh
echo "CORASTATE_MASTER_KEY=$(openssl rand -base64 32)" >> .env
```

The master key is only read by the sync worker (architecture-v3 §"Credential and security architecture"). The API process never sees it.

### Step 3. Apply migrations (~2 sec)

```sh
pnpm migrate
```

This runs the Drizzle migrations, converts `observations` to a range-partitioned table, rolls the partition window forward 7 days, and creates the `current_state` materialized view.

### Step 4. Load demo data (~2 sec)

```sh
pnpm seed
```

This writes:

- Two demo sources (`Okta (demo)` and `Defender (demo)`, both marked inactive so the worker does not try to poll them).
- 20 identities (Okta side only, since Defender does not emit identities).
- 30 devices, with overlap: 18 are seen by both sources (correlation completes them), 6 are Defender-only (Okta gap), 6 are Okta-only (Defender gap). The Defender gap and Okta gap are what the **Missing from** column in the Devices view surfaces.
- The correlation engine runs over the new observations and writes 30 rows to `canonical_devices`.

Re-running `pnpm seed --reset` truncates the demo data first for a clean slate.

### Step 5. Boot the apps (~10 sec)

```sh
pnpm dev
```

This spawns three processes in parallel:

- **Backend** on `http://localhost:4000` (Fastify, serves `/v1/*` and `/internal/*`).
- **Web app** on `http://localhost:5173` (Vite, proxies `/v1/*` and `/internal/*` to the backend).
- **Worker** with the polling loop. The demo sources are inactive, so it sleeps after one tick.

Open `http://localhost:5173` in a browser. The Devices view loads with 30 correlated devices, the Identities view with 20 people, and the Sources view with the two demo sources showing `succeeded`. The Health view at `/#/health` rounds it out.

### Step 6. Verify the API (~10 sec)

```sh
curl -s 'http://localhost:4000/v1/devices?limit=3' | jq '.items[0]'
curl -s http://localhost:4000/v1/sources | jq .
curl -s http://localhost:4000/internal/healthz | jq .
```

### Step 7. Optional, run the UI smoke tests (~10 sec)

```sh
pnpm test:ui
```

Playwright boots the backend + web (or reuses your existing `pnpm dev`), navigates each of the four views, and asserts the data surface renders. Screenshots land in `apps/web/test-results/`.

### Tearing down

```sh
docker compose down            # stops the containers, keeps the data
docker compose down -v         # stops and wipes the postgres volume
```

## Architecture in one paragraph

The web app and the Fastify backend share the `packages/contracts` Zod schemas; every API response is validated on both sides. The backend reads from the database, never from a connector directly. The sync worker is the only process holding the master key; it polls active sources, runs each connector's `runSync` against the observation log, and after every batch the correlation engine collapses cross-source observations into `canonical_devices` by configured match keys. The CLI offers operator commands (`migrate`, `seed`, `sync`, `diagnose`). See `architecture-v3.md` for the full picture and the load-bearing decisions.

## Deployment topology

Two shapes, same application, no code paths branch on the deployment.

- **Local + self-hosted** (Phase 1 target). Docker Compose brings up Postgres; backend, worker, and web run as Node processes. The master key comes from a `.env` file.
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

## Repository layout

```
apps/
  backend/     Fastify API (/v1, /internal)
  web/         React + Vite + Tailwind + shadcn SPA
  worker/      Polling sync runner, only process with the master key
  cli/         Operator CLI: migrate, seed, sync, diagnose
packages/
  contracts/   Zod canonical schema (Device, Identity, API shapes)
  connector-sdk/    defineConnector + named strategy registry
  connector-okta/        Authored
  connector-defender/    Authored
  connector-crowdstrike, connector-intune, connector-jamf/  Scaffolds
  core/        Sync runner, correlation engine, observation writer, secrets
  db/          Drizzle schema + migrate runner + partition roll
configs/
  correlation.json   Match keys, source priorities, compliance rules
```

## License

Apache 2.0. See `LICENSE`. Commercial connectors will live in a separate package under a source-available license; the boundary is enforced by the connector framework, not license trickery.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). Short version: open a discussion before authoring a new connector. The segmented skeleton has hard shape constraints (architecture-v3 §"How the Phase 3 AI companion fits") and a misshapen connector PR is hard to redirect.
