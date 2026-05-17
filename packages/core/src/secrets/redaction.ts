/**
 * Pino redaction config. Wired into the logger from the start, not added
 * after a leak (architecture-v3 §"Credential and security architecture").
 *
 * pino uses fast-redact under the hood. The path syntax is `a.b.c` with `*`
 * as a single-level wildcard — there is no recursive wildcard, so common
 * secret-y key names appear both as bare paths (top-level objects, log
 * line shapes the worker produces) and behind one wildcard layer.
 */

export const PINO_REDACT_PATHS: readonly string[] = [
  // HTTP — Fastify default log shape carries req/res with headers.
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-api-key"]',
  'req.headers["x-auth-token"]',
  'res.headers["set-cookie"]',

  // Common credential-y field names at the top level.
  'password',
  'passwd',
  'token',
  'accessToken',
  'refreshToken',
  'apiToken',
  'api_token',
  'apiKey',
  'api_key',
  'secret',
  'clientSecret',
  'client_secret',
  'authorization',

  // Same names one level down (sub-object). Covers `{ config: { apiToken } }`,
  // `{ secrets: { apiToken } }`, etc.
  '*.password',
  '*.passwd',
  '*.token',
  '*.accessToken',
  '*.refreshToken',
  '*.apiToken',
  '*.api_token',
  '*.apiKey',
  '*.api_key',
  '*.secret',
  '*.clientSecret',
  '*.client_secret',

  // Two levels down. pino's fast-redact wildcards are single-segment, so we
  // enumerate. Covers `{ ctx: { config: { apiToken } } }` shapes the worker
  // is likely to produce.
  '*.*.password',
  '*.*.token',
  '*.*.accessToken',
  '*.*.refreshToken',
  '*.*.apiToken',
  '*.*.api_token',
  '*.*.apiKey',
  '*.*.api_key',
  '*.*.secret',
  '*.*.clientSecret',

  // The credential-record fields. Even encrypted, these should not appear
  // in logs — both because they're useless without context and because they
  // make log lines noisy. Plus the raw data key (plaintext during decrypt).
  'plaintext',
  'dataKey',
  'masterKey',
  'wrappedDataKey',
  'wrappedDataKeyNonce',
  'ciphertext',
  'keyBytes',

  // The MasterKey.bytes field surfaced by KeyProvider. The only common
  // legitimate `bytes` field in this codebase; if a wider use lands, scope
  // this tighter.
  'bytes',
  '*.bytes',

  // Credential records that might get logged in their entirety.
  '*.credential',
  '*.credentials',
  '*.wrappedDataKey',
  '*.ciphertext',
  '*.plaintext',
] as const;

export interface PinoRedactConfig {
  paths: string[];
  censor: string;
}

/**
 * Returns the pino redact config the API process, the worker, and the CLI
 * all pass to `pino({ redact, ... })`.
 */
export function pinoRedact(): PinoRedactConfig {
  return { paths: [...PINO_REDACT_PATHS], censor: '[REDACTED]' };
}
