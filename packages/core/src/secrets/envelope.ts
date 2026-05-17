/**
 * Envelope-encryption primitives. AES-256-GCM throughout. No database access
 * here — these are pure crypto helpers. The credential store
 * (`credential-store.ts`) calls them and persists the result.
 *
 * Layout: every secret has its own freshly generated 32-byte data key. The
 * data key encrypts the secret; the master key encrypts the data key. Both
 * GCM operations consume the same `aad` bytes so a ciphertext+wrappedDataKey
 * pair cannot be transplanted between credentials, even by an actor with
 * write access to the credentials table.
 */

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

import type { MasterKey } from './key-provider.js';

/** Length of the AES-256 data key. */
const DATA_KEY_BYTES = 32;
/** Length of the GCM nonce/IV. 12 is the recommended GCM IV length. */
const GCM_NONCE_BYTES = 12;
/** Length of the GCM auth tag. */
const GCM_TAG_BYTES = 16;

/**
 * Additional Authenticated Data shape. Carries the stable identifier of the
 * row the ciphertext belongs to. Both the wrap (data-key → master-key) and
 * the inner encrypt (plaintext → data-key) authenticate this.
 *
 * Stored alongside the ciphertext as JSONB so an audit reader can see it
 * without decrypting anything.
 */
export interface AadFields {
  sourceId: string;
  name: string;
}

/**
 * Bytes passed to GCM. Deterministic: identical AadFields produce identical
 * bytes across processes and Node versions. NUL byte between fields so
 * `{sourceId: "ok", name: "ta"}` and `{sourceId: "okta", name: ""}` get
 * distinct AAD.
 */
export function buildAadBytes(aad: AadFields): Buffer {
  return Buffer.from(`${aad.sourceId}\x00${aad.name}`, 'utf8');
}

export interface EnvelopeRecord {
  /** plaintext encrypted under data key, with the GCM auth tag appended (last 16 bytes). */
  ciphertext: Buffer;
  /** GCM nonce used to produce `ciphertext`. */
  nonce: Buffer;
  /** data key encrypted under master key, with the GCM auth tag appended. */
  wrappedDataKey: Buffer;
  /** GCM nonce used to produce `wrappedDataKey`. */
  wrappedDataKeyNonce: Buffer;
  /** Master-key id used to wrap the data key. Matches the active KeyProvider's keyId. */
  keyId: string;
}

export interface EncryptOptions {
  /** Override the data key. Tests pass a fixed value here; production never does. */
  dataKey?: Buffer;
}

/**
 * Generate a fresh data key, encrypt the plaintext under it, wrap the data
 * key under the master key. Both GCM operations authenticate `aad`.
 */
export function encrypt(
  plaintext: string,
  aad: AadFields,
  masterKey: MasterKey,
  options: EncryptOptions = {},
): EnvelopeRecord {
  const dataKey = options.dataKey ?? randomBytes(DATA_KEY_BYTES);
  if (dataKey.length !== DATA_KEY_BYTES) {
    throw new Error(`encrypt: dataKey must be ${DATA_KEY_BYTES} bytes (got ${dataKey.length}).`);
  }

  const aadBytes = buildAadBytes(aad);

  // Inner: plaintext under data key.
  const innerNonce = randomBytes(GCM_NONCE_BYTES);
  const innerCipher = createCipheriv('aes-256-gcm', dataKey, innerNonce);
  innerCipher.setAAD(aadBytes);
  const innerBody = Buffer.concat([
    innerCipher.update(Buffer.from(plaintext, 'utf8')),
    innerCipher.final(),
  ]);
  const innerTag = innerCipher.getAuthTag();

  // Outer: wrap data key under master key.
  const outerNonce = randomBytes(GCM_NONCE_BYTES);
  const outerCipher = createCipheriv('aes-256-gcm', masterKey.bytes, outerNonce);
  outerCipher.setAAD(aadBytes);
  const outerBody = Buffer.concat([outerCipher.update(dataKey), outerCipher.final()]);
  const outerTag = outerCipher.getAuthTag();

  return {
    ciphertext: Buffer.concat([innerBody, innerTag]),
    nonce: innerNonce,
    wrappedDataKey: Buffer.concat([outerBody, outerTag]),
    wrappedDataKeyNonce: outerNonce,
    keyId: masterKey.keyId,
  };
}

/**
 * Reverse of `encrypt`. Throws on AAD mismatch, auth-tag mismatch, or any
 * other GCM verification failure — the credential store turns that into an
 * audit row with `succeeded=false` and surfaces the error to the caller.
 */
export function decrypt(record: EnvelopeRecord, aad: AadFields, masterKey: MasterKey): string {
  if (masterKey.keyId !== record.keyId) {
    throw new Error(
      `decrypt: master key id mismatch. record.keyId=${record.keyId}, masterKey.keyId=${masterKey.keyId}.`,
    );
  }
  const aadBytes = buildAadBytes(aad);

  const dataKey = unwrapDataKey(record.wrappedDataKey, record.wrappedDataKeyNonce, aadBytes, masterKey.bytes);

  const ctTagOffset = record.ciphertext.length - GCM_TAG_BYTES;
  if (ctTagOffset < 0) {
    throw new Error('decrypt: ciphertext shorter than GCM auth tag.');
  }
  const ct = record.ciphertext.subarray(0, ctTagOffset);
  const tag = record.ciphertext.subarray(ctTagOffset);

  const innerDecipher = createDecipheriv('aes-256-gcm', dataKey, record.nonce);
  innerDecipher.setAAD(aadBytes);
  innerDecipher.setAuthTag(tag);
  const plaintext = Buffer.concat([innerDecipher.update(ct), innerDecipher.final()]);
  return plaintext.toString('utf8');
}

/**
 * Unwrap only the data key. Used by rotation: rotate doesn't touch the
 * inner ciphertext, only re-wraps the data key under a new master key.
 * Returns the raw data-key bytes.
 */
export function unwrapDataKey(
  wrappedDataKey: Buffer,
  wrappedDataKeyNonce: Buffer,
  aadBytes: Buffer,
  masterKeyBytes: Buffer,
): Buffer {
  const tagOffset = wrappedDataKey.length - GCM_TAG_BYTES;
  if (tagOffset < 0) {
    throw new Error('unwrapDataKey: wrappedDataKey shorter than GCM auth tag.');
  }
  const body = wrappedDataKey.subarray(0, tagOffset);
  const tag = wrappedDataKey.subarray(tagOffset);

  const decipher = createDecipheriv('aes-256-gcm', masterKeyBytes, wrappedDataKeyNonce);
  decipher.setAAD(aadBytes);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]);
}

/**
 * Decrypt a ciphertext under a known data key (skip the wrap step). Used by
 * the credential store when it has already unwrapped the data key once and
 * wants to decrypt a sibling ciphertext (e.g. the OAuth refresh token,
 * which is encrypted under the same data key as the access token).
 */
export function decryptUnderDataKey(
  ciphertext: Buffer,
  nonce: Buffer,
  aadBytes: Buffer,
  dataKey: Buffer,
): string {
  const tagOffset = ciphertext.length - GCM_TAG_BYTES;
  if (tagOffset < 0) {
    throw new Error('decryptUnderDataKey: ciphertext shorter than GCM auth tag.');
  }
  const body = ciphertext.subarray(0, tagOffset);
  const tag = ciphertext.subarray(tagOffset);
  const decipher = createDecipheriv('aes-256-gcm', dataKey, nonce);
  decipher.setAAD(aadBytes);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8');
}

/**
 * Wrap a data key under a master key. Used by rotation: take the unwrapped
 * data key (from `unwrapDataKey`) and re-wrap under the new master.
 */
export function wrapDataKey(
  dataKey: Buffer,
  aadBytes: Buffer,
  masterKey: MasterKey,
): { wrappedDataKey: Buffer; wrappedDataKeyNonce: Buffer } {
  const nonce = randomBytes(GCM_NONCE_BYTES);
  const cipher = createCipheriv('aes-256-gcm', masterKey.bytes, nonce);
  cipher.setAAD(aadBytes);
  const body = Buffer.concat([cipher.update(dataKey), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    wrappedDataKey: Buffer.concat([body, tag]),
    wrappedDataKeyNonce: nonce,
  };
}

/**
 * Constant-time equality on two Buffers of the same length. Used by tests
 * that want to confirm a round-tripped value matches without leaking
 * timing information.
 */
export function bytesEqual(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
