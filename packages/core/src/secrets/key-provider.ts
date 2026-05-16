/**
 * KeyProvider — the boundary between the credential store and the master
 * key's actual source. Phase 1 ships only the env-var implementation, but
 * the interface is in place so HashiCorp Vault, AWS KMS, and GCP KMS
 * implementations can land later without a schema migration or call-site
 * change (architecture-v3.md §"Credential and security architecture").
 *
 * The provider returns *raw key material* the credential module then uses
 * to wrap/unwrap data keys with AES-256-GCM. KMS-backed implementations
 * will return a handle plus encrypt/decrypt callbacks instead of raw bytes,
 * but that future shape lands in the same interface — the credential
 * module already calls through here, never reaches into process.env.
 */

import { createHash } from 'node:crypto';

/** Length, in bytes, of an AES-256 master key. */
export const MASTER_KEY_BYTES = 32;

export interface MasterKey {
  /**
   * Provider-supplied stable id for this key version. Recorded on every
   * wrapped data key as `credentials.key_version_id`'s underlying `key_id`.
   * Stable across boots; rotation produces a new id.
   */
  keyId: string;
  /** Raw key material. AES-256 means 32 bytes. */
  bytes: Buffer;
}

export interface KeyProvider {
  /** Name surfaced in diagnostics — e.g. 'env', 'vault', 'aws-kms'. */
  readonly providerName: string;
  /** The currently active master key. The worker calls this once at boot. */
  getCurrentKey(): Promise<MasterKey>;
  /**
   * Look up a historical key by its provider id. Rotation re-wraps every
   * credential's data key under the current key, but in-flight or partial
   * rotations may still need to decrypt under an older one.
   */
  getKeyById(keyId: string): Promise<MasterKey>;
}

// ---------------------------------------------------------------------------
// Env-var provider — the only Phase 1 implementation.
// ---------------------------------------------------------------------------

export interface EnvKeyProviderOptions {
  /** Env var holding the base64-encoded current master key. */
  envVar?: string;
}

const DEFAULT_ENV_VAR = 'CORASTATE_MASTER_KEY';

/**
 * Reads a base64-encoded 32-byte key from an environment variable. Used by
 * the local Docker Compose deployment and by the AWS deployment via an ECS
 * task secret (architecture-v3.md §"Deployment topology"). The worker is
 * the only process that gets this env var; the API process does not.
 */
export class EnvKeyProvider implements KeyProvider {
  public readonly providerName = 'env';
  private readonly envVar: string;

  constructor(options: EnvKeyProviderOptions = {}) {
    this.envVar = options.envVar ?? DEFAULT_ENV_VAR;
  }

  async getCurrentKey(): Promise<MasterKey> {
    const raw = process.env[this.envVar];
    if (!raw) {
      throw new Error(
        `EnvKeyProvider: ${this.envVar} is not set. See .env.example for the expected shape.`,
      );
    }
    const bytes = Buffer.from(raw, 'base64');
    if (bytes.length !== MASTER_KEY_BYTES) {
      throw new Error(
        `EnvKeyProvider: ${this.envVar} must decode to ${MASTER_KEY_BYTES} bytes (got ${bytes.length}). ` +
          'Generate one with: openssl rand -base64 32',
      );
    }
    return { keyId: deriveKeyId(bytes), bytes };
  }

  async getKeyById(keyId: string): Promise<MasterKey> {
    // Phase 1: only one env-var key exists per process. If the requested
    // id matches the current key, return it; otherwise the credential
    // module has to surface a clear error rather than silently mis-decrypt.
    const current = await this.getCurrentKey();
    if (current.keyId !== keyId) {
      throw new Error(
        `EnvKeyProvider: requested key_id ${keyId} is not present in env. Rotation across env-var keys requires the old key still set in ${this.envVar}.`,
      );
    }
    return current;
  }
}

/**
 * Derive a stable, non-secret identifier from key bytes. SHA-256 of the key,
 * truncated, prefixed with the provider name. Reveals nothing useful about
 * the key but is reproducible across boots: the same env value yields the
 * same keyId so credentials wrapped before a restart still unwrap after.
 */
function deriveKeyId(bytes: Buffer): string {
  const digest = createHash('sha256').update(bytes).digest('hex').slice(0, 16);
  return `env:${digest}`;
}

// ---------------------------------------------------------------------------
// TODO(later phases) — implementations that ship behind the same interface:
//
// HashiCorp Vault:  wraps requests to Vault's transit secrets engine. The
//                   master key never leaves Vault; the provider returns a
//                   handle plus encrypt/decrypt callbacks rather than raw
//                   bytes. Credential module is shaped to accept that.
//                   Out of Phase 1 per architecture-v3 §"What v1 does not do".
//
// AWS KMS:          like Vault, the key stays in KMS; this provider uses
//                   the AWS SDK's Encrypt/Decrypt calls. The ECS task role
//                   grants kms:Encrypt/Decrypt on one specific CMK.
//                   Out of Phase 1.
//
// GCP KMS:          analogous to AWS KMS, against Cloud KMS. Out of Phase 1.
// ---------------------------------------------------------------------------
