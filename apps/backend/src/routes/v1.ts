/**
 * /v1 — the stable, versioned, externally-documented surface. Once an
 * attribute lands here it stays; types do not change.
 *
 * Week 2 adds /v1/sources and /v1/identities; /v1/devices and identity
 * detail are Week 3.
 */

import type { FastifyPluginAsync } from 'fastify';
import { createHealthzPlugin } from './healthz.js';
import { sourcesRoutes } from './v1/sources.js';
import { identitiesRoutes } from './v1/identities.js';

export const v1Routes: FastifyPluginAsync = async (app) => {
  await app.register(createHealthzPlugin());
  await app.register(sourcesRoutes);
  await app.register(identitiesRoutes);
  // TODO(week-3): /v1/devices, /v1/devices/:id, /v1/identities/:id
};
