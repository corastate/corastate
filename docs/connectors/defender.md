# Microsoft Defender for Endpoint connector

The Defender connector reads managed devices from Microsoft Graph
(`/deviceManagement/managedDevices`). The same Graph endpoint backs both
Microsoft Intune and Defender for Endpoint, since they share the underlying
MDM data model. Authentication is OAuth 2.0 client credentials against
Azure Active Directory (Entra ID).

- **Connector id:** `defender`
- **Package:** `@corastate/connector-defender` (`packages/connector-defender/`)
- **Entities emitted:** `device` (from `/deviceManagement/managedDevices`)

## What the connector reads

| Endpoint | Entity | Notes |
| --- | --- | --- |
| `GET /v1.0/deviceManagement/managedDevices` | device | Hostname, serial number, hardware UUID, Azure AD device id, MAC addresses, OS version, disk-encryption status, MDM enrollment status, EDR agent status, owner email, last check-in. Paginated via `@odata.nextLink`. |

The full mapping is in [`packages/connector-defender/src/mapping.ts`](../../packages/connector-defender/src/mapping.ts). The connector emits only `device` observations — identities are Okta's side of the picture in the Phase 1 build.

The connector is read-only: `DeviceManagementManagedDevices.Read.All` is the only Graph permission it needs.

## Acquire credentials (Entra app registration)

You need three values, all bound to a single Entra app registration:

1. **Tenant ID** — the Azure AD directory id (uuid).
2. **Client ID (application ID)** — the app registration's id.
3. **Client secret** — a secret value generated under the app registration.

### 1. Register an application

1. Sign in to the [Microsoft Entra admin center](https://entra.microsoft.com) as a Cloud Application Administrator or higher.
2. Navigate to **Identity → Applications → App registrations → New registration**.
3. **Name:** `corastate-defender` (or whatever your install policy requires).
4. **Supported account types:** *Accounts in this organizational directory only (single tenant)*.
5. **Redirect URI:** leave empty — client-credentials flow has no redirect.
6. Click **Register**.

Copy the **Application (client) ID** and **Directory (tenant) ID** shown on the Overview blade.

### 2. Add a client secret

1. Open the app registration → **Certificates & secrets → Client secrets → New client secret**.
2. Set an expiry that fits your rotation policy. Microsoft caps secrets at 24 months. Shorter is fine; document the rotation date.
3. Copy the **Value** column — Azure will not show it again. (The "Secret ID" column is not what the connector wants.)

### 3. Grant Graph permissions

1. App registration → **API permissions → Add a permission → Microsoft Graph → Application permissions**.
2. Search for and add `DeviceManagementManagedDevices.Read.All`.
3. Back on the **API permissions** page, click **Grant admin consent for <tenant>**. The admin-consent step requires a Privileged Role Administrator or Global Administrator; this is the cost of using the application-permissions model in Graph and is intentional.

Without admin consent the connector will authenticate but get HTTP 403 on every device read.

> **Defender vs Intune permission scopes.** `DeviceManagementManagedDevices.Read.All` covers the Graph endpoint Corastate calls regardless of which product (Intune or Defender) is the source of truth for a given device in your tenant. If your tenant has only Defender for Endpoint and no Intune licence, the same permission applies; the endpoint will still return Defender-managed devices.

### 4. (Optional) Restrict the app

For tighter blast radius:

- **Conditional Access:** restrict the app's sign-in to a specific IP range (e.g. your Corastate host).
- **Service Principal Sign-in Activity:** keep monitoring on — token issuance for this app is the only authentication signal you'll see, and a sudden spike means something is wrong.

## Register the source in Corastate

The source row stores the tenant id; the credentials store holds the client id + client secret, encrypted.

### 1. Insert the source row

```sql
INSERT INTO sources (connector_id, display_name, config, active)
VALUES (
  'defender',
  'Defender (acme prod)',
  '{"tenantId": "<your-tenant-uuid>"}'::jsonb,
  true
)
RETURNING id;
```

The `tenantId` is embedded in the OAuth token URL — `https://login.microsoftonline.com/<tenant>/oauth2/v2.0/token` — so it must be the Directory ID, not the primary domain (`contoso.onmicrosoft.com`).

### 2. Store the OAuth client credentials

Two encrypted credentials, both keyed on the source id from step 1. The names are what `packages/connector-defender/src/auth.ts` references and must not be renamed:

```ts
import { createDb } from '@corastate/db';
import { EnvKeyProvider, putCredential } from '@corastate/core';

const { db, sql } = createDb();
const env = new EnvKeyProvider('CORASTATE_MASTER_KEY');
const sourceId = '<source-id-from-step-1>';
try {
  await putCredential({ db, keyProvider: env }, {
    sourceId,
    name: 'defender.client_id',
    value: '<application-client-id-uuid>',
  });
  await putCredential({ db, keyProvider: env }, {
    sourceId,
    name: 'defender.client_secret',
    value: '<client-secret-value>',
  });
} finally {
  await sql.end();
}
```

The client id is technically not a secret (it's visible in the Entra UI) but Corastate encrypts it anyway so the credential store is the one place a deployment looks for connector configuration.

### 3. Trigger the first sync

```sh
pnpm cli sync defender
```

The CLI sync command is still scaffolded in Phase 1; the worker is the supported path. On a successful run, `sync_runs.status = 'succeeded'` for the new `source_id`, `observation_count` will be in the hundreds to thousands (one observation per attribute per device), and `/v1/overview` will show the source's coverage row populated.

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| `sync_runs.status = failed`, error contains `AADSTS70011` | Wrong scope. The connector requests `https://graph.microsoft.com/.default`; if your tenant has a custom Graph audience that won't match. |
| `sync_runs.status = failed`, error contains `AADSTS7000215` | Client secret invalid or expired. Generate a new one in the app registration and re-run `putCredential` for `defender.client_secret`. |
| `sync_runs.status = failed`, HTTP 403 from Graph | `DeviceManagementManagedDevices.Read.All` was added but not consented. Go back to the app registration's API permissions blade and click *Grant admin consent*. |
| `sync_runs.status = failed`, HTTP 401 from Graph | Token issued but for a different audience. Check that the source row's `tenantId` matches the tenant the app registration lives in. |
| Sync succeeds but `device_count = 0` | The tenant has no Intune- or Defender-managed devices, or the app's permission scope filters them out (e.g. a custom Graph subscription model). Confirm in the Defender portal that managed devices exist. |
