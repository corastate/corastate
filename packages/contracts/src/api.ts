// API request/response shapes. Both /v1 (stable) and /internal (unversioned)
// import from here. The backend validates every response against these; the
// frontend imports the same Zod-inferred types for end-to-end safety
// (architecture-v3 §"The canonical schema as contract spine").

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

// ---------------------------------------------------------------------------
// /v1/sources
// ---------------------------------------------------------------------------

export const sourceStatusSchema = z
  .enum(['idle', 'running', 'succeeded', 'failed', 'cancelled'])
  .describe(
    'Aggregate last-run status of a configured source. `idle` means no sync has run yet; ' +
      'the other values mirror sync_runs.status from the most recent run.',
  );

export type SourceStatus = z.infer<typeof sourceStatusSchema>;

export const sourceListItemSchema = z
  .object({
    id: z.string().uuid().describe('Configured-source uuid (sources.id).'),
    name: z.string().describe('Operator-supplied display name.'),
    type: z
      .string()
      .describe('Connector id, e.g. "okta" or "defender". Matches Connector.identity.id.'),
    active: z.boolean().describe('Whether the worker should sync this source on its next pass.'),
    lastSyncedAt: z
      .coerce.date()
      .nullable()
      .describe('Start time of the most recent sync, or null if never synced.'),
    status: sourceStatusSchema,
  })
  .describe('One row in the /v1/sources response.');

export type SourceListItem = z.infer<typeof sourceListItemSchema>;

export const sourceListResponseSchema = z.object({
  items: z.array(sourceListItemSchema),
  total: z.number().int().nonnegative(),
});

export type SourceListResponse = z.infer<typeof sourceListResponseSchema>;

// ---------------------------------------------------------------------------
// /v1/identities (paginated)
// ---------------------------------------------------------------------------

/**
 * Cursor-paginated list shape. Cursor is opaque to the client; backends
 * encode whatever sort key they need into it. The Week-2 implementation
 * encodes `<iso-updated_at>|<entity-uuid>` so ties on updated_at are stable.
 */
export const cursorPageQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(50),
  cursor: z.string().min(1).optional(),
  q: z
    .string()
    .min(1)
    .max(200)
    .optional()
    .describe('Free-text fuzzy filter. Matches email and display name (case-insensitive).'),
});

export type CursorPageQuery = z.infer<typeof cursorPageQuerySchema>;

export const identityListResponseSchema = z.object({
  items: z.array(identitySchema),
  nextCursor: z.string().nullable().describe('Cursor for the next page, or null if exhausted.'),
});

export type IdentityListResponse = z.infer<typeof identityListResponseSchema>;

export const deviceListResponseSchema = z.object({
  items: z.array(deviceSchema),
  nextCursor: z.string().nullable(),
});

export type DeviceListResponse = z.infer<typeof deviceListResponseSchema>;

// Legacy helper: still used by /internal until Week 4 settles its shape.
export const listResponseSchema = <T extends z.ZodTypeAny>(item: T) =>
  z.object({
    items: z.array(item),
    total: z.number().int().nonnegative(),
  });
