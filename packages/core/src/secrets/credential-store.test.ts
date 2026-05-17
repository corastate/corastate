/**
 * End-to-end round-trip test for the credential store.
 *
 * Runs against a real Postgres (the docker-compose container locally, the
 * services-postgres container in CI). The Week 1 gate per
 * phase-1-sprint-plan-v3.md §"Week 1 gate":
 *   "A secret can be written encrypted and read back decrypted, with the
 *   decrypt recorded in the audit log."
 *
 * Test fixture management:
 *   - Generates a fresh master key per test run, scoped via a unique env
 *     var name so concurrent test workers don't collide.
 *   - Inserts credentials with a unique source_id per test so the table
 *     can stay around between runs without cross-contamination.
 *   - Verifies the credential_access_audit row exists for every decrypt.
 */

import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pino from 'pino';
import { eq, and, desc } from 'drizzle-orm';
import { Writable } from 'node:stream';

import {
  createDb,
  credentialAccessAudit,
  credentials,
  keyVersions,
  type Database,
} from '@corastate/db';
import type { Sql } from 'postgres';

import {
  EnvKeyProvider,
  encrypt,
  decrypt,
  getCredential,
  pinoRedact,
  putCredential,
  rotateMasterKey,
  type MasterKey,
} from './index.js';

let db: Database;
let sql: Sql;
let provider: EnvKeyProvider;
let envVarName: string;

const TEST_SOURCE_ID_PREFIX = `test-${randomUUID().slice(0, 8)}`;

beforeAll(() => {
  if (!process.env.DATABASE_URL) {
    throw new Error('credential-store test: DATABASE_URL is required.');
  }

  // Unique env var per test process so parallel workers stay isolated.
  envVarName = `CORASTATE_TEST_MASTER_KEY_${process.pid}`;
  const masterKey = randomBytes(32).toString('base64');
  process.env[envVarName] = masterKey;

  provider = new EnvKeyProvider({ envVar: envVarName });
  ({ db, sql } = createDb());
});

afterAll(async () => {
  // Clean up test rows so the DB doesn't accumulate across runs.
  if (db) {
    const all = await db
      .select({ id: credentials.id, sourceId: credentials.sourceId })
      .from(credentials);
    const ours = all.filter((r) => r.sourceId.startsWith(TEST_SOURCE_ID_PREFIX));
    for (const row of ours) {
      await db.delete(credentialAccessAudit).where(eq(credentialAccessAudit.credentialId, row.id));
      await db.delete(credentials).where(eq(credentials.id, row.id));
    }
  }
  if (sql) await sql.end();
  delete process.env[envVarName];
});

describe('credential store round-trip', () => {
  it('encrypts and decrypts, recording every decrypt in the audit log', async () => {
    const sourceId = `${TEST_SOURCE_ID_PREFIX}-roundtrip`;
    const name = 'api_token';
    const value = 'super-secret-okta-token-' + randomUUID();

    // Encrypt + store.
    const credentialId = await putCredential({ db, keyProvider: provider }, { sourceId, name, value });
    expect(credentialId).toMatch(/^[0-9a-f-]{36}$/);

    // Decrypt round-trip.
    const decrypted = await getCredential({ db, keyProvider: provider }, { sourceId, name });
    expect(decrypted.value).toBe(value);
    expect(decrypted.id).toBe(credentialId);
    expect(decrypted.dead).toBe(false);

    // Audit row exists for the decrypt.
    const auditRows = await db
      .select()
      .from(credentialAccessAudit)
      .where(
        and(
          eq(credentialAccessAudit.credentialId, credentialId),
          eq(credentialAccessAudit.action, 'decrypt'),
        ),
      )
      .orderBy(desc(credentialAccessAudit.occurredAt));

    expect(auditRows.length).toBeGreaterThanOrEqual(1);
    const latest = auditRows[0]!;
    expect(latest.succeeded).toBe(true);
    expect(latest.sourceId).toBe(sourceId);
    expect(latest.name).toBe(name);
    expect(latest.errorMessage).toBeNull();

    // And one for the original encrypt.
    const encryptAudits = await db
      .select()
      .from(credentialAccessAudit)
      .where(
        and(
          eq(credentialAccessAudit.credentialId, credentialId),
          eq(credentialAccessAudit.action, 'encrypt'),
        ),
      );
    expect(encryptAudits.length).toBe(1);
    expect(encryptAudits[0]!.succeeded).toBe(true);
  });

  it('refuses to decrypt with the wrong AAD (transplant attack)', async () => {
    const sourceId = `${TEST_SOURCE_ID_PREFIX}-aad`;
    const name = 'api_token';
    const value = 'token-' + randomUUID();
    await putCredential({ db, keyProvider: provider }, { sourceId, name, value });

    // Read the row and try to decrypt it as if it were a different credential.
    const [row] = await db
      .select()
      .from(credentials)
      .where(and(eq(credentials.sourceId, sourceId), eq(credentials.name, name)))
      .limit(1);
    expect(row).toBeDefined();

    const masterKey = await provider.getCurrentKey();
    expect(() =>
      decrypt(
        {
          ciphertext: Buffer.from(row!.ciphertext),
          nonce: Buffer.from(row!.nonce),
          wrappedDataKey: Buffer.from(row!.wrappedDataKey),
          wrappedDataKeyNonce: Buffer.from(row!.wrappedDataKeyNonce),
          keyId: masterKey.keyId,
        },
        { sourceId: 'attacker', name: 'pretend-its-mine' },
        masterKey,
      ),
    ).toThrowError();
  });

  it('rotates the master key without decrypting plaintext', async () => {
    const sourceId = `${TEST_SOURCE_ID_PREFIX}-rotation`;
    const name = 'api_token';
    const value = 'token-' + randomUUID();
    await putCredential({ db, keyProvider: provider }, { sourceId, name, value });

    // Build a "new" master key in memory. EnvKeyProvider can only see the
    // env var; rotateMasterKey accepts a freshly-built MasterKey directly.
    const newBytes = randomBytes(32);
    const newKey: MasterKey = {
      // Make the keyId visibly different from the env-var-derived one.
      keyId: 'test-new:' + randomUUID().slice(0, 8),
      bytes: newBytes,
    };

    const result = await rotateMasterKey({ db, keyProvider: provider }, newKey);
    expect(result.rotated).toBeGreaterThanOrEqual(1);
    expect(result.newKeyId).toBe(newKey.keyId);

    // The credential now references the new key version; the env provider
    // can't decrypt under the new key. Sanity-check by re-wrapping back
    // under the original env key so the suite's cleanup path still works.
    const originalKey = await provider.getCurrentKey();
    // After rotateMasterKey, key_versions.is_current is the new row. Flip back.
    const back = await rotateMasterKey(
      {
        db,
        keyProvider: {
          providerName: 'in-memory',
          async getCurrentKey() {
            return newKey;
          },
          async getKeyById(keyId: string) {
            if (keyId === newKey.keyId) return newKey;
            throw new Error(`in-memory provider: unknown keyId ${keyId}`);
          },
        },
      },
      originalKey,
    );
    expect(back.rotated).toBeGreaterThanOrEqual(1);

    // Round-trip works again under the original provider.
    const after = await getCredential({ db, keyProvider: provider }, { sourceId, name });
    expect(after.value).toBe(value);
  });
});

describe('pino redaction', () => {
  it('replaces credential-y fields with [REDACTED]', async () => {
    const lines: string[] = [];
    const stream = new Writable({
      write(chunk, _enc, cb) {
        lines.push(chunk.toString('utf8'));
        cb();
      },
    });

    const log = pino({ level: 'info', redact: pinoRedact() }, stream);

    const fakeRecord = {
      sourceId: 'okta',
      name: 'api_token',
      // These should all be redacted by the configured paths.
      password: 'hunter2',
      token: 'jwt.abc.def',
      apiToken: 'SSWS abc',
      api_token: 'snake-case',
      secret: 'shhh',
      clientSecret: 'oauth-shhh',
      ciphertext: 'lots of bytes',
      wrappedDataKey: 'more bytes',
      plaintext: 'the-secret-value',
      config: {
        apiToken: 'nested-token',
        api_key: 'nested-key',
        password: 'nested-password',
      },
    };

    log.info({ fake: fakeRecord }, 'a log line carrying a credential-shaped object');

    // Wait a tick for pino's stream to flush.
    await new Promise((r) => setImmediate(r));

    expect(lines.length).toBeGreaterThan(0);
    const joined = lines.join('\n');

    // Plaintext-y values must not appear anywhere in the output.
    expect(joined).not.toContain('hunter2');
    expect(joined).not.toContain('jwt.abc.def');
    expect(joined).not.toContain('SSWS abc');
    expect(joined).not.toContain('snake-case');
    expect(joined).not.toContain('shhh');
    expect(joined).not.toContain('oauth-shhh');
    expect(joined).not.toContain('lots of bytes');
    expect(joined).not.toContain('more bytes');
    expect(joined).not.toContain('the-secret-value');
    expect(joined).not.toContain('nested-token');
    expect(joined).not.toContain('nested-key');
    expect(joined).not.toContain('nested-password');

    // And the redaction marker is present.
    expect(joined).toContain('[REDACTED]');

    // sourceId/name are not redacted (they're audit-visible identifiers).
    expect(joined).toContain('okta');
    expect(joined).toContain('api_token');
  });
});

describe('envelope encrypt/decrypt (pure crypto)', () => {
  it('round-trips a plaintext without touching the database', async () => {
    const masterKey = await provider.getCurrentKey();
    const plaintext = 'pure-crypto-round-trip-' + randomUUID();
    const aad = { sourceId: 'unit', name: 'pure' };

    const record = encrypt(plaintext, aad, masterKey);
    const decrypted = decrypt(record, aad, masterKey);
    expect(decrypted).toBe(plaintext);
  });

  it('fails closed when the master key bytes change', async () => {
    const masterKey = await provider.getCurrentKey();
    const record = encrypt('value', { sourceId: 'unit', name: 'pure' }, masterKey);
    const wrongKey: MasterKey = { keyId: masterKey.keyId, bytes: randomBytes(32) };
    expect(() => decrypt(record, { sourceId: 'unit', name: 'pure' }, wrongKey)).toThrowError();
  });
});

// Silence unused-import warnings in environments where keyVersions wasn't read.
void keyVersions;
