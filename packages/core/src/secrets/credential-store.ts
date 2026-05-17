/**
 * Credential store. Database-aware wrappers over `envelope.ts` that handle
 * the `credentials`, `key_versions`, and `credential_access_audit` tables.
 *
 * The public surface:
 *   - putCredential        Encrypt + insert/update a credential row.
 *   - getCredential        Decrypt + return plaintext; writes an audit row.
 *   - rotateMasterKey      Re-wrap every credential's data key under a new
 *                          master. Plaintext never decrypts.
 *
 * Audit semantics: every decrypt writes a `credential_access_audit` row,
 * success or failure. Encrypt and rotate also audit. The observation-log
 * instinct applied to credential access (architecture-v3
 * §"Credential and security architecture").
 */

import { and, eq } from 'drizzle-orm';

import {
  credentials,
  credentialAccessAudit,
  keyVersions,
  type Database,
  type CredentialAction,
} from '@corastate/db';

import {
  buildAadBytes,
  decrypt,
  decryptUnderDataKey,
  encrypt,
  unwrapDataKey,
  wrapDataKey,
  type EnvelopeRecord,
} from './envelope.js';
import type { KeyProvider, MasterKey } from './key-provider.js';

export interface PutCredentialInput {
  sourceId: string;
  name: string;
  value: string;
  /** Optional OAuth refresh token, encrypted under the same data key. */
  refreshToken?: string;
  /** UTC timestamp the access token expires. NULL for non-OAuth credentials. */
  expiresAt?: Date;
}

export interface GetCredentialInput {
  sourceId: string;
  name: string;
  /** Run id to record on the audit row when the worker is mid-sync. */
  syncRunId?: string;
}

export interface CredentialStoreDeps {
  db: Database;
  keyProvider: KeyProvider;
}

/**
 * Ensure a `key_versions` row exists for the provider's current key and is
 * marked current. Returns the row's serial id (used as the FK on credentials).
 * Idempotent — safe to call on every encrypt.
 */
export async function ensureCurrentKeyVersion(deps: CredentialStoreDeps): Promise<{
  id: number;
  keyId: string;
}> {
  const masterKey = await deps.keyProvider.getCurrentKey();
  const existing = await deps.db
    .select({ id: keyVersions.id, keyId: keyVersions.keyId, isCurrent: keyVersions.isCurrent })
    .from(keyVersions)
    .where(eq(keyVersions.keyId, masterKey.keyId))
    .limit(1);

  if (existing.length === 0) {
    // Demote any other current row first, then insert the new one as current.
    await deps.db
      .update(keyVersions)
      .set({ isCurrent: false, deactivatedAt: new Date() })
      .where(eq(keyVersions.isCurrent, true));
    const [inserted] = await deps.db
      .insert(keyVersions)
      .values({ keyId: masterKey.keyId, isCurrent: true })
      .returning({ id: keyVersions.id, keyId: keyVersions.keyId });
    if (!inserted) {
      throw new Error('ensureCurrentKeyVersion: insert returned no rows.');
    }
    return inserted;
  }

  const row = existing[0]!;
  if (!row.isCurrent) {
    // Re-activate this version. Rotation-recovery path.
    await deps.db
      .update(keyVersions)
      .set({ isCurrent: false, deactivatedAt: new Date() })
      .where(eq(keyVersions.isCurrent, true));
    await deps.db
      .update(keyVersions)
      .set({ isCurrent: true, deactivatedAt: null })
      .where(eq(keyVersions.id, row.id));
  }
  return { id: row.id, keyId: row.keyId };
}

/**
 * Encrypt and upsert a credential. Returns the credentials.id.
 *
 * The (sourceId, name) pair is the upsert key; calling again for the same
 * pair replaces the encrypted value. An encrypt audit row is written.
 */
export async function putCredential(
  deps: CredentialStoreDeps,
  input: PutCredentialInput,
): Promise<string> {
  const masterKey = await deps.keyProvider.getCurrentKey();
  const version = await ensureCurrentKeyVersion(deps);
  if (version.keyId !== masterKey.keyId) {
    throw new Error(
      `putCredential: provider current key (${masterKey.keyId}) differs from current key_versions row (${version.keyId}).`,
    );
  }

  const aad = { sourceId: input.sourceId, name: input.name };
  const main = encrypt(input.value, aad, masterKey);

  // Refresh tokens are encrypted under the *same* data key so the atomic
  // OAuth lifecycle (architecture-v3 §"Explicit OAuth token lifecycle")
  // can rewrap both fields in one round-trip if the data key ever rotates.
  let refreshCiphertext: Buffer | null = null;
  let refreshNonce: Buffer | null = null;
  if (input.refreshToken !== undefined) {
    // Reuse main's data key by re-wrapping under a fresh nonce.
    // We don't have direct access to it after encrypt(), so we go through
    // unwrap → encrypt-under-same-key. Cheap, and keeps the asymmetric
    // primitives untouched.
    const aadBytes = buildAadBytes(aad);
    const dataKey = unwrapDataKey(main.wrappedDataKey, main.wrappedDataKeyNonce, aadBytes, masterKey.bytes);
    const refreshRecord = encrypt(input.refreshToken, aad, masterKey, { dataKey });
    refreshCiphertext = refreshRecord.ciphertext;
    refreshNonce = refreshRecord.nonce;
  }

  const existing = await deps.db
    .select({ id: credentials.id })
    .from(credentials)
    .where(and(eq(credentials.sourceId, input.sourceId), eq(credentials.name, input.name)))
    .limit(1);

  let credentialId: string;
  if (existing.length === 0) {
    const [row] = await deps.db
      .insert(credentials)
      .values({
        sourceId: input.sourceId,
        name: input.name,
        ciphertext: main.ciphertext,
        nonce: main.nonce,
        wrappedDataKey: main.wrappedDataKey,
        wrappedDataKeyNonce: main.wrappedDataKeyNonce,
        keyVersionId: version.id,
        aad,
        oauthRefreshCiphertext: refreshCiphertext,
        oauthRefreshNonce: refreshNonce,
        expiresAt: input.expiresAt ?? null,
      })
      .returning({ id: credentials.id });
    if (!row) {
      throw new Error('putCredential: insert returned no rows.');
    }
    credentialId = row.id;
  } else {
    credentialId = existing[0]!.id;
    await deps.db
      .update(credentials)
      .set({
        ciphertext: main.ciphertext,
        nonce: main.nonce,
        wrappedDataKey: main.wrappedDataKey,
        wrappedDataKeyNonce: main.wrappedDataKeyNonce,
        keyVersionId: version.id,
        oauthRefreshCiphertext: refreshCiphertext,
        oauthRefreshNonce: refreshNonce,
        expiresAt: input.expiresAt ?? null,
        dead: false,
        updatedAt: new Date(),
      })
      .where(eq(credentials.id, credentialId));
  }

  await writeAudit(deps.db, {
    credentialId,
    sourceId: input.sourceId,
    name: input.name,
    action: 'encrypt',
    succeeded: true,
  });

  return credentialId;
}

export interface DecryptedCredential {
  /** credentials.id */
  id: string;
  value: string;
  refreshToken: string | null;
  expiresAt: Date | null;
  dead: boolean;
}

/**
 * Decrypt and return a credential's plaintext. Writes an audit row whether
 * or not the decrypt succeeded. Throws on missing row, missing key, or any
 * crypto failure.
 */
export async function getCredential(
  deps: CredentialStoreDeps,
  input: GetCredentialInput,
): Promise<DecryptedCredential> {
  const rows = await deps.db
    .select({
      id: credentials.id,
      sourceId: credentials.sourceId,
      name: credentials.name,
      ciphertext: credentials.ciphertext,
      nonce: credentials.nonce,
      wrappedDataKey: credentials.wrappedDataKey,
      wrappedDataKeyNonce: credentials.wrappedDataKeyNonce,
      keyVersionId: credentials.keyVersionId,
      oauthRefreshCiphertext: credentials.oauthRefreshCiphertext,
      oauthRefreshNonce: credentials.oauthRefreshNonce,
      expiresAt: credentials.expiresAt,
      dead: credentials.dead,
    })
    .from(credentials)
    .where(and(eq(credentials.sourceId, input.sourceId), eq(credentials.name, input.name)))
    .limit(1);

  if (rows.length === 0) {
    await writeAudit(deps.db, {
      credentialId: null,
      sourceId: input.sourceId,
      name: input.name,
      action: 'decrypt',
      succeeded: false,
      errorMessage: 'credential not found',
      ...(input.syncRunId !== undefined ? { syncRunId: input.syncRunId } : {}),
    });
    throw new Error(`getCredential: no credential for (${input.sourceId}, ${input.name}).`);
  }
  const row = rows[0]!;

  // Look up the master key version that wrapped this row.
  const versionRows = await deps.db
    .select({ keyId: keyVersions.keyId })
    .from(keyVersions)
    .where(eq(keyVersions.id, row.keyVersionId))
    .limit(1);
  if (versionRows.length === 0) {
    await writeAudit(deps.db, {
      credentialId: row.id,
      sourceId: input.sourceId,
      name: input.name,
      action: 'decrypt',
      succeeded: false,
      errorMessage: `key_versions row ${row.keyVersionId} missing`,
      ...(input.syncRunId !== undefined ? { syncRunId: input.syncRunId } : {}),
    });
    throw new Error(`getCredential: key_versions row ${row.keyVersionId} missing.`);
  }
  const versionKeyId = versionRows[0]!.keyId;

  let masterKey: MasterKey;
  try {
    masterKey = await deps.keyProvider.getKeyById(versionKeyId);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    await writeAudit(deps.db, {
      credentialId: row.id,
      sourceId: input.sourceId,
      name: input.name,
      action: 'decrypt',
      succeeded: false,
      errorMessage: `key provider: ${errorMessage}`,
      ...(input.syncRunId !== undefined ? { syncRunId: input.syncRunId } : {}),
    });
    throw err;
  }

  const aad = { sourceId: input.sourceId, name: input.name };
  const envelopeRecord: EnvelopeRecord = {
    ciphertext: ensureBuffer(row.ciphertext),
    nonce: ensureBuffer(row.nonce),
    wrappedDataKey: ensureBuffer(row.wrappedDataKey),
    wrappedDataKeyNonce: ensureBuffer(row.wrappedDataKeyNonce),
    keyId: versionKeyId,
  };

  let value: string;
  try {
    value = decrypt(envelopeRecord, aad, masterKey);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    await writeAudit(deps.db, {
      credentialId: row.id,
      sourceId: input.sourceId,
      name: input.name,
      action: 'decrypt',
      succeeded: false,
      errorMessage,
      ...(input.syncRunId !== undefined ? { syncRunId: input.syncRunId } : {}),
    });
    throw err;
  }

  let refreshToken: string | null = null;
  if (row.oauthRefreshCiphertext && row.oauthRefreshNonce) {
    const aadBytes = buildAadBytes(aad);
    const dataKey = unwrapDataKey(
      envelopeRecord.wrappedDataKey,
      envelopeRecord.wrappedDataKeyNonce,
      aadBytes,
      masterKey.bytes,
    );
    const refreshRecord: EnvelopeRecord = {
      ciphertext: ensureBuffer(row.oauthRefreshCiphertext),
      nonce: ensureBuffer(row.oauthRefreshNonce),
      wrappedDataKey: envelopeRecord.wrappedDataKey,
      wrappedDataKeyNonce: envelopeRecord.wrappedDataKeyNonce,
      keyId: versionKeyId,
    };
    // Refresh token uses the same data key; re-derive via wrapDataKey identity.
    // We already have the data key bytes; bypass the public decrypt path for it.
    refreshToken = decryptUnderDataKey(
      refreshRecord.ciphertext,
      refreshRecord.nonce,
      aadBytes,
      dataKey,
    );
  }

  await writeAudit(deps.db, {
    credentialId: row.id,
    sourceId: input.sourceId,
    name: input.name,
    action: 'decrypt',
    succeeded: true,
    ...(input.syncRunId !== undefined ? { syncRunId: input.syncRunId } : {}),
  });

  return {
    id: row.id,
    value,
    refreshToken,
    expiresAt: row.expiresAt,
    dead: row.dead,
  };
}

export interface RotateResult {
  rotated: number;
  newKeyVersionId: number;
  newKeyId: string;
}

/**
 * Re-wrap every credential's data key under `newKey`. The inner ciphertext
 * (the secret value) is never decrypted — only the data key changes its
 * wrapping. Atomic per credential; the function bails on the first failure
 * and leaves earlier rows already rotated (the new master and the old
 * master both have to be available for any later retry).
 *
 * Caller responsibility:
 *   1. Both the current key (via deps.keyProvider) and `newKey` must be
 *      accessible during the call.
 *   2. After this returns, deploy the new key as the env-var current key
 *      and restart the worker. The next `ensureCurrentKeyVersion` flips
 *      `is_current` to the new row.
 */
export async function rotateMasterKey(
  deps: CredentialStoreDeps,
  newKey: MasterKey,
): Promise<RotateResult> {
  const currentKey = await deps.keyProvider.getCurrentKey();
  if (currentKey.keyId === newKey.keyId) {
    // No-op rotation. Still audit so the action is traceable.
    const existing = await deps.db
      .select({ id: keyVersions.id })
      .from(keyVersions)
      .where(eq(keyVersions.keyId, newKey.keyId))
      .limit(1);
    if (existing.length === 0) {
      throw new Error('rotateMasterKey: no key_versions row for current key; encrypt something first.');
    }
    return { rotated: 0, newKeyVersionId: existing[0]!.id, newKeyId: newKey.keyId };
  }

  // Find or create the key_versions row for the new key. Re-rotating back
  // to a previously-seen key is legitimate (test path; also production
  // rollback) and must not violate the unique constraint on key_id.
  let newVersion: { id: number };
  const existingNew = await deps.db
    .select({ id: keyVersions.id })
    .from(keyVersions)
    .where(eq(keyVersions.keyId, newKey.keyId))
    .limit(1);
  if (existingNew.length === 0) {
    const [inserted] = await deps.db
      .insert(keyVersions)
      .values({ keyId: newKey.keyId, isCurrent: false })
      .returning({ id: keyVersions.id });
    if (!inserted) {
      throw new Error('rotateMasterKey: insert into key_versions returned no rows.');
    }
    newVersion = inserted;
  } else {
    newVersion = existingNew[0]!;
  }

  const oldVersionRows = await deps.db
    .select({ id: keyVersions.id })
    .from(keyVersions)
    .where(eq(keyVersions.keyId, currentKey.keyId))
    .limit(1);
  if (oldVersionRows.length === 0) {
    throw new Error('rotateMasterKey: no key_versions row for current key.');
  }
  const oldVersionId = oldVersionRows[0]!.id;

  const all = await deps.db
    .select({
      id: credentials.id,
      sourceId: credentials.sourceId,
      name: credentials.name,
      wrappedDataKey: credentials.wrappedDataKey,
      wrappedDataKeyNonce: credentials.wrappedDataKeyNonce,
    })
    .from(credentials)
    .where(eq(credentials.keyVersionId, oldVersionId));

  let rotated = 0;
  for (const row of all) {
    const aadBytes = buildAadBytes({ sourceId: row.sourceId, name: row.name });
    const dataKey = unwrapDataKey(
      ensureBuffer(row.wrappedDataKey),
      ensureBuffer(row.wrappedDataKeyNonce),
      aadBytes,
      currentKey.bytes,
    );
    const rewrapped = wrapDataKey(dataKey, aadBytes, newKey);
    await deps.db
      .update(credentials)
      .set({
        wrappedDataKey: rewrapped.wrappedDataKey,
        wrappedDataKeyNonce: rewrapped.wrappedDataKeyNonce,
        keyVersionId: newVersion.id,
        updatedAt: new Date(),
      })
      .where(eq(credentials.id, row.id));
    await writeAudit(deps.db, {
      credentialId: row.id,
      sourceId: row.sourceId,
      name: row.name,
      action: 'rotate',
      succeeded: true,
    });
    rotated += 1;
  }

  // Flip is_current: deactivate old, activate new.
  await deps.db
    .update(keyVersions)
    .set({ isCurrent: false, deactivatedAt: new Date() })
    .where(eq(keyVersions.isCurrent, true));
  await deps.db
    .update(keyVersions)
    .set({ isCurrent: true, deactivatedAt: null })
    .where(eq(keyVersions.id, newVersion.id));

  return { rotated, newKeyVersionId: newVersion.id, newKeyId: newKey.keyId };
}

/**
 * Mark a credential dead — a permanent-failure flag the UI surfaces. The
 * row remains for audit purposes; the worker stops trying to use it.
 */
export async function markCredentialDead(
  deps: CredentialStoreDeps,
  input: { sourceId: string; name: string; reason: string },
): Promise<void> {
  const rows = await deps.db
    .update(credentials)
    .set({ dead: true, updatedAt: new Date() })
    .where(and(eq(credentials.sourceId, input.sourceId), eq(credentials.name, input.name)))
    .returning({ id: credentials.id });
  const credentialId = rows[0]?.id ?? null;
  await writeAudit(deps.db, {
    credentialId,
    sourceId: input.sourceId,
    name: input.name,
    action: 'mark_dead',
    succeeded: true,
    errorMessage: input.reason,
  });
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

interface AuditRow {
  credentialId: string | null;
  sourceId: string;
  name: string;
  syncRunId?: string;
  action: CredentialAction;
  succeeded: boolean;
  errorMessage?: string;
}

async function writeAudit(db: Database, row: AuditRow): Promise<void> {
  await db.insert(credentialAccessAudit).values({
    credentialId: row.credentialId,
    sourceId: row.sourceId,
    name: row.name,
    syncRunId: row.syncRunId ?? null,
    action: row.action,
    succeeded: row.succeeded,
    errorMessage: row.errorMessage ?? null,
  });
}

/**
 * postgres.js returns bytea as Uint8Array; drizzle may pass it through as
 * Buffer or Uint8Array depending on driver settings. Normalize.
 */
function ensureBuffer(b: Buffer | Uint8Array): Buffer {
  return Buffer.isBuffer(b) ? b : Buffer.from(b);
}
