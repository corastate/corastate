// Secret references — the connector names a secret; the runner resolves it
// from the encrypted credential store before invoking the auth strategy.
// Values never appear in connector code or in this package.

export interface SecretRef {
  /** Logical name. The credential store maps (sourceId, name) -> ciphertext. */
  name: string;
}

export function secret(name: string): SecretRef {
  return { name };
}

/**
 * Resolved at runtime by the sync runner. Connectors never see this directly;
 * the runner injects already-resolved secrets into the auth strategy context.
 */
export interface ResolvedSecrets {
  /** Look up a secret value by ref. Throws if the ref does not resolve. */
  get(ref: SecretRef): string;
}
