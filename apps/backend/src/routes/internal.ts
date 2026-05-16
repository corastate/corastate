/**
 * /internal — the unversioned, frontend-only surface. Fast-moving endpoints
 * land here first and graduate to /v1 once their shape is settled. No
 * external consumer is allowed to depend on /internal.
 *
 * The correlation-config editor (Phase 2), diagnostics views, and other
 * UI-only routes live here.
 */

import type { FastifyPluginAsync } from 'fastify';
import { createHealthzPlugin } from './healthz.js';

export const internalRoutes: FastifyPluginAsync = async (app) => {
  await app.register(createHealthzPlugin());
  // TODO: diagnostics, correlation-config editor (Phase 2), UI-only views.
};
