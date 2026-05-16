// API request/response shapes. Both /v1 (stable) and /internal (unversioned)
// import from here. Stubs only for the structural commit; Week 2+ fleshes them
// out as endpoints land.

import { z } from 'zod';
import { deviceSchema } from './device.js';
import { identitySchema } from './identity.js';

export const healthResponseSchema = z
  .object({
    status: z.enum(['ok', 'degraded']).describe('Aggregate health.'),
    uptime: z.number().describe('Process uptime in seconds.'),
    db: z.enum(['ok', 'unreachable']).describe('Database reachability.'),
  })
  .describe('Response shape for /v1/healthz and /internal/healthz.');

export type HealthResponse = z.infer<typeof healthResponseSchema>;

// Placeholders. The real shapes for /v1/devices, /v1/identities, /v1/sources
// land in Week 2 once the sync runner and correlation engine exist.

export const listResponseSchema = <T extends z.ZodTypeAny>(item: T) =>
  z.object({
    items: z.array(item),
    total: z.number().int().nonnegative(),
  });

export const deviceListResponseSchema = listResponseSchema(deviceSchema);
export type DeviceListResponse = z.infer<typeof deviceListResponseSchema>;

export const identityListResponseSchema = listResponseSchema(identitySchema);
export type IdentityListResponse = z.infer<typeof identityListResponseSchema>;
