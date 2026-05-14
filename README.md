# Corastate

Open-core device health aggregation engine. Reads from the endpoint security and MDM tools you already pay for, correlates devices across those tools, ties identities to devices, and surfaces the gaps. Read-only in v1.

## What this is

Your IT director knows there are 1247 employees and roughly 1500 endpoints. The CrowdStrike console shows 1389 agents. Intune shows 1102 devices. Okta lists 1247 humans with active sessions in the last 30 days. Jamf shows 612 Macs. Three of those four numbers are wrong, and you have no idea which three until audit week, when someone asks why the laptop assigned to a contractor who left in February is still phoning home from a coffee shop in Lisbon.

The mid-market is stuck on this problem. Above 2500 employees the answer is Axonius or Tanium, which start north of $50K, expect a six-week pro services engagement, and assume you have a security engineering team to keep the integrations alive. Below 250 employees the answer is Fleet plus some bash. In between, you have neither the budget for the first nor the headcount for the second. Kolide was the tool people in this band actually liked, because its user-facing Slack remediation pushed work back onto the employee rather than the IT queue. Since the 1Password acquisition, that product has been folded into something else, and the gap has reopened.

Corastate fills that gap with a deliberately smaller surface. Five connectors for v1, shipped well. Correlation and gap detection are the product. The open source core does the ingestion and the read-side queries. A commercial tier adds connectors that talk to enterprise vendors with paid API tiers, and (in v2) the write actions that change state in those tools. v1 surfaces health dimensions you already understand: agent presence, agent recent check-in, OS patch level, disk encryption state, MDM enrollment, EDR running state. The product is what happens when those dimensions are joined across tools: a device in Okta but missing from MDM, a device in CrowdStrike but not Intune, a Jamf Mac with no EDR agent, an Entra-joined Windows device that has not reported home in 11 days.

## Status

**Phase 1 in progress.** This repository is the scaffold for v1.0.

What works today:

- pnpm workspace with backend, web, CLI, and the four shared packages.
- Postgres 16 in Docker, with Adminer for poking at it.
- Drizzle schema for `observations`, `entities`, and `sync_runs`. Matches the architecture doc.
- The connector SDK type contract (`Connector`, `ReadCapability`, `WriteCapability`, `Observation`).
- Fastify backend that boots, talks to Postgres, and serves `/healthz`, `/v1/devices`, `/v1/identities`.
- React + Vite + Tailwind + shadcn web shell that fetches devices from the backend.
- Commander CLI with `migrate`, `sync`, `diagnose` commands.

What does not work yet:

- Real connector implementations. Okta is a typed skeleton. CrowdStrike, Intune, Jamf, and the reference Defender connector are not in the tree.
- The correlation engine. The entity-matching strategy is documented in `packages/core/src/correlate.ts` but not implemented.
- The partition conversion for the observations table. The generated migration creates a plain table; the daily-partition wrapper is a TODO in `packages/db/src/migrate.ts`.
- Webhook receiver, digest email, Slack and Teams alert sinks.

## The 30-minute walkthrough

### Prerequisites

- Node.js 20.11 or newer
- pnpm 9 or newer (`npm i -g pnpm` if you do not have it)
- Docker (for Postgres)

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

Verify Postgres is up:

```sh
docker compose ps
```

You should see `corastate-postgres` and `corastate-adminer` in state `running` or `healthy`.

### Step 3. Run database migrations

```sh
pnpm db:generate   # produces drizzle/0000_*.sql from the Drizzle schema
pnpm migrate       # applies migrations and creates the current_state view
```

The first command writes a generated SQL migration into `packages/db/drizzle/`. The second applies it.

Note: the partition conversion for the observations table is not in the tree yet. You will see a warning that says so. The schema works as a plain table until that file is added.

### Step 4. Run the apps

```sh
pnpm dev
```

This starts the backend, the web app, and the CLI in watch mode. Two ports to know:

- Backend: `http://localhost:4000` (try `curl localhost:4000/healthz`)
- Web: `http://localhost:5173`

Open `http://localhost:5173` in a browser. You should see the Corastate shell with an empty device list and a Refresh button that round-trips through the backend to Postgres.

### What you should see

- `GET /healthz` returns `{"status":"ok","uptime":N,"db":"ok"}`.
- `GET /v1/devices` returns `{"items":[],"total":0}` (because nothing has been synced yet).
- The web UI says "No devices yet" with a working Refresh button.
- Adminer at `http://localhost:8081` shows three tables: `observations`, `entities`, `sync_runs`, plus one materialized view `current_state`.

If all four of those check out, the scaffold is up.

### Tearing down

```sh
docker compose down            # stops the containers, keeps the data
docker compose down -v         # stops and wipes the postgres volume
```

## Architecture

The full architecture write-up, including the two load-bearing decisions (observation log over current-state tables, and capability registration over implicit connector contracts), lives at:

`/docs/architecture.md` in the canonical repo, or in the long-form post at corastate.com.

The short version:

- One append-only `observations` table. Partitioned by date. Every fact a connector ever reported lives here forever (within the retention window).
- A `current_state` materialized view computes the most recent value per `(entity, source, attribute)` and is refreshed at the end of every sync run.
- Connectors register capabilities declaratively. The framework reads the capability set and decides what to ask of the connector. Capabilities not declared do not exist as far as the framework is concerned.

## Connectors

| Name                | Status        | License      | Capabilities                                |
| ------------------- | ------------- | ------------ | ------------------------------------------- |
| Microsoft Defender  | Not started   | Apache-2.0   | reads: devices, agents, compliance          |
| Okta                | Skeleton only | Apache-2.0\* | reads: identities                           |
| CrowdStrike Falcon  | Not started   | Commercial   | reads: devices, agents, compliance          |
| Microsoft Intune    | Not started   | Commercial   | reads: devices, compliance                  |
| Jamf Pro            | Not started   | Commercial   | reads: devices, compliance                  |

\* The Okta connector lives in the open source tree today because the API tier we need is free. If that changes it moves to the commercial package.

The capability columns describe what each connector will declare once implemented. The framework refuses to call into a code path the connector did not declare.

## License

Apache 2.0. See `LICENSE` at the repo root.

The commercial connectors (CrowdStrike, Intune, Jamf, and future paid-API integrations) ship as a separate npm package under a source-available license, installed alongside this core. The boundary between the two is enforced by the capability registration framework, not by license trickery.

## How to contribute

Short version: please do. See [CONTRIBUTING.md](./CONTRIBUTING.md) for what is helpful right now and what to leave alone until the v1 surface settles.

The fastest way to influence v1.0 is to email and tell me which fifth connector you would replace Jamf with, and why. Wesley Lakis, wesley at corastate dot com.
