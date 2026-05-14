/**
 * Backend entrypoint. Builds the Fastify app and binds to the configured host
 * and port. Handles graceful shutdown on SIGTERM and SIGINT.
 */

import { buildServer } from './server.js';

async function main(): Promise<void> {
  const app = await buildServer();
  const host = process.env.BACKEND_HOST ?? '0.0.0.0';
  const port = Number(process.env.BACKEND_PORT ?? 4000);

  try {
    await app.listen({ host, port });
  } catch (err) {
    app.log.error({ err }, 'failed to start');
    process.exit(1);
  }

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ signal }, 'shutting down');
    try {
      await app.close();
      process.exit(0);
    } catch (err) {
      app.log.error({ err }, 'error during shutdown');
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

void main();
