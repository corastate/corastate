/**
 * /v1 — the stable, versioned, externally-documented surface. Once an
 * attribute lands here it stays; types do not change. Real endpoints land in
 * Week 2 (`/v1/sources`, `/v1/identities`) and Week 3 (`/v1/devices`); this
 * structural commit ships /v1/healthz only.
 */

import type { FastifyPluginAsync } from 'fastify';
import { createHealthzPlugin } from './healthz.js';

export const v1Routes: FastifyPluginAsync = async (app) => {
  await app.register(createHealthzPlugin());
  // TODO(week-2): /v1/sources, /v1/identities, /v1/identities/:id
  // TODO(week-3): /v1/devices, /v1/devices/:id
};
