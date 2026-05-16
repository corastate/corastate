// The secrets module. Phase 1 surfaces:
//   - KeyProvider interface + EnvKeyProvider (this commit)
//   - encrypt/decrypt helpers using envelope encryption (Phase 1 Week 1)
//   - credential-access audit writer (Week 1)
//   - OAuth token lifecycle helpers (Week 1)
//   - log redaction (Week 1)
//
// This commit ships the KeyProvider only; the rest land in the Week 1
// implementation pass per phase-1-sprint-plan-v3.md.

export * from './key-provider.js';
