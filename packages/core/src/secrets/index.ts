// The secrets module. Phase 1 Week 1 surface:
//   - KeyProvider interface + EnvKeyProvider (env-var, the only Phase 1 impl).
//   - envelope encrypt/decrypt primitives (AES-256-GCM, AAD-authenticated).
//   - credential store: putCredential, getCredential (audits decrypt),
//     rotateMasterKey, markCredentialDead.
//   - pino redaction config wired into the logger from the start.

export * from './key-provider.js';
export * from './envelope.js';
export * from './credential-store.js';
export * from './redaction.js';
