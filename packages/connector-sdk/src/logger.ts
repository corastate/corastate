// Minimal logger shape every piece accepts. The runner passes a pino-shaped
// logger that already has redaction wired in (see architecture-v3.md
// §"Credential and security architecture").

export interface Logger {
  trace(obj: unknown, msg?: string): void;
  debug(obj: unknown, msg?: string): void;
  info(obj: unknown, msg?: string): void;
  warn(obj: unknown, msg?: string): void;
  error(obj: unknown, msg?: string): void;
}
