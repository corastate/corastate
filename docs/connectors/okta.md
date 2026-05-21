# Okta connector

The Okta connector reads users (identities) and devices from an Okta org via the public Okta REST API. It uses an SSWS API token for authentication and Okta's `Link: rel="next"` header for pagination.

- **Connector id:** `okta`
- **Package:** `@corastate/connector-okta` (`packages/connector-okta/`)
- **Entities emitted:** `identity` (from `/api/v1/users`), `device` (from `/api/v1/devices`)

## What the connector reads

| Endpoint | Entity | Notes |
| --- | --- | --- |
| `GET /api/v1/users` | identity | Email, display name, lifecycle status (`active`/`suspended`/`deactivated`/`unknown`), last login, the Okta user id (`00u…`). |
| `GET /api/v1/devices` | device | Hostname, serial number, OS version, owner email (when Okta has linked the device to a user), last check-in. |

The full mapping lives in [`packages/connector-okta/src/mapping.ts`](../../packages/connector-okta/src/mapping.ts). Connector code never speaks any vendor enum directly: every value is normalized to the canonical `Device` / `Identity` shape in `@corastate/contracts` before it lands in the observation log.

The connector is read-only. It never writes to Okta.

## Required Okta permissions

Okta API tokens inherit the permissions of the admin who created them. Create the token with an admin role that grants **read-only** access to:

- **Users:** Read users
- **Devices:** Read devices (the Devices admin role; some Okta tenants gate this behind a feature flag — confirm under *Security → Administrators → Standard administrator roles*)

If your org runs Okta Identity Governance or another bundle that exposes a custom read-only admin role, prefer that to a full Super Admin token.

## Acquire an API token

1. Sign in to your Okta admin console (`https://<your-tenant>-admin.okta.com`).
2. Go to **Security → API → Tokens**.
3. Click **Create token**.
4. Name it something traceable, e.g. `corastate-prod` or `corastate-staging`.
5. Copy the token value — Okta will not show it again.

The token format is a long opaque string. Treat it like a password; it bypasses MFA for every API the admin can reach.

> **Rotation.** Okta tokens are valid for 30 days of inactivity. If Corastate stops syncing for that long the token will be revoked silently and the next run will fail with HTTP 401. Re-create the token and `corastate sources rotate okta <new-token>` to recover.

## Register the source in Corastate

A source ties a connector to its per-install config (the Okta base URL) and its credential. Until the Phase 2 source-management UI ships, registration is two database writes — a row in `sources` and a credential in the encrypted credential store.

### 1. Insert the source row

The `sources` table is keyed by `display_name` for human reference; `connector_id` is the connector lookup key (`okta` here), and `config` is the per-tenant baseUrl.

```sql
-- packages/db/drizzle/0002_sources.sql defines the schema.
INSERT INTO sources (connector_id, display_name, config, active)
VALUES (
  'okta',
  'Okta (acme prod)',
  '{"baseUrl": "https://acme.okta.com"}'::jsonb,
  true
)
RETURNING id;
```

Note the returned `id` — that's the `source_id` you pass when storing the credential.

The `baseUrl` is your **org URL**, not the admin URL: `https://<tenant>.okta.com`, no path suffix. Custom domains work too.

### 2. Store the API token

Credentials go through the envelope-encrypted credential store; the value never appears in plaintext after the call returns. The credential name `okta.api_token` is what `packages/connector-okta/src/auth.ts` references.

A small Node script using `@corastate/core`'s `putCredential` helper:

```ts
import { createDb } from '@corastate/db';
import { EnvKeyProvider, putCredential } from '@corastate/core';

const { db, sql } = createDb();
try {
  await putCredential(
    { db, keyProvider: new EnvKeyProvider('CORASTATE_MASTER_KEY') },
    {
      sourceId: '<source-id-from-step-1>',
      name: 'okta.api_token',
      value: '<the-okta-ssws-token>',
    },
  );
} finally {
  await sql.end();
}
```

`CORASTATE_MASTER_KEY` must be the 32-byte master key (base64-encoded) the rest of the install uses. The credential row is bound to that key version; rotating the master key re-wraps the data key.

### 3. Trigger the first sync

Once the source row and credential are in place, the worker will pick the source up on its next polling pass (the `active` flag controls whether the worker iterates it). To trigger a sync immediately:

```sh
pnpm cli sync okta
```

The CLI sync command is still scaffolded in Phase 1; the worker is the supported path. Watch `sync_runs` for a row with `status = 'succeeded'` and a non-zero `observation_count`. The `/v1/overview` and `/v1/devices` endpoints will then reflect the new data on their next read.

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| `sync_runs.status = failed`, error contains `401` | Token revoked or wrong tenant. Re-create the token and rotate. |
| `sync_runs.status = failed`, error contains `429` | Okta rate limit. The connector backs off automatically, but a sustained 429 means the org's API budget is exhausted; reduce sync frequency. |
| Devices appear in `/v1/devices` but show no owner | Okta has not associated the device with a user. This is an Okta-side enrollment issue, not a connector issue. |
| Devices missing entirely | The Devices admin role may be missing from the token's owner. Check **Security → Administrators**. |
