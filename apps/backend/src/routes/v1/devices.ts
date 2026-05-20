/**
 * GET /v1/devices — paginated list of correlated devices from
 * `canonical_devices`. Per the v3 architecture, the correlation engine
 * (Week 3) writes one row per cross-source merged device; this route is a
 * thin read of that table with cursor pagination + a fuzzy filter on
 * hostname / owner email.
 *
 * Cursor pagination uses (updated_at, id) for stability across writes; the
 * cursor is opaque base64url, same encoding as /v1/identities.
 */

import { sql } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';

import {
  cursorPageQuerySchema,
  deviceListResponseSchema,
  type Device,
  type DeviceListResponse,
} from '@corastate/contracts';

interface CanonicalDeviceRow {
  id: string;
  hostname: string | null;
  serial_number: string | null;
  hardware_uuid: string | null;
  azure_ad_device_id: string | null;
  mac_addresses: unknown;
  os_version: string | null;
  disk_encryption: boolean | null;
  mdm_enrolled: boolean | null;
  agent_running: boolean | null;
  owner_email: string | null;
  last_check_in: Date | string | null;
  sources: unknown;
  missing_from: unknown;
  source_last_seen: unknown;
  updated_at: Date | string;
}

export const devicesRoutes: FastifyPluginAsync = async (app) => {
  app.get('/devices', async (request, reply): Promise<DeviceListResponse> => {
    const parsed = cursorPageQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      reply.code(400);
      return reply.send({
        error: 'invalid_query',
        details: parsed.error.flatten(),
      }) as unknown as DeviceListResponse;
    }
    const { limit, cursor, q } = parsed.data;
    const cursorDecoded = decodeCursor(cursor);
    const fuzzy = q ? `%${q.toLowerCase()}%` : null;

    const rows = (await app.db.execute(sql<CanonicalDeviceRow>`
      SELECT
        d.id::text             AS id,
        d.hostname             AS hostname,
        d.serial_number        AS serial_number,
        d.hardware_uuid        AS hardware_uuid,
        d.azure_ad_device_id   AS azure_ad_device_id,
        d.mac_addresses        AS mac_addresses,
        d.os_version           AS os_version,
        d.disk_encryption      AS disk_encryption,
        d.mdm_enrolled         AS mdm_enrolled,
        d.agent_running        AS agent_running,
        d.owner_email          AS owner_email,
        d.last_check_in        AS last_check_in,
        d.sources              AS sources,
        d.missing_from         AS missing_from,
        d.source_last_seen     AS source_last_seen,
        d.updated_at           AS updated_at
      FROM canonical_devices d
      WHERE TRUE
        ${cursorDecoded
          ? sql`AND (d.updated_at, d.id) < (${cursorDecoded.updatedAt}::timestamptz, ${cursorDecoded.id}::uuid)`
          : sql``}
        ${fuzzy
          ? sql`AND (
              lower(coalesce(d.hostname, '')) LIKE ${fuzzy}
              OR lower(coalesce(d.owner_email, '')) LIKE ${fuzzy}
            )`
          : sql``}
      ORDER BY d.updated_at DESC, d.id DESC
      LIMIT ${limit + 1}
    `)) as unknown as CanonicalDeviceRow[];

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];
    const nextCursor = hasMore && last
      ? encodeCursor({ updatedAt: toIso(last.updated_at), id: last.id })
      : null;

    const items: Device[] = page.map((row): Device => ({
      id: row.id,
      hostname: row.hostname,
      serialNumber: row.serial_number,
      hardwareUuid: row.hardware_uuid,
      azureAdDeviceId: row.azure_ad_device_id,
      macAddresses: stringArrayOr(row.mac_addresses, []),
      osVersion: row.os_version,
      diskEncryption: row.disk_encryption,
      mdmEnrolled: row.mdm_enrolled,
      agentRunning: row.agent_running,
      ownerEmail: row.owner_email,
      lastCheckIn: row.last_check_in ? parseDate(row.last_check_in) : null,
      sources: stringArrayOr(row.sources, []),
      missingFrom: stringArrayOr(row.missing_from, []),
      sourceLastSeen: sourceLastSeenOr(row.source_last_seen, {}),
    }));

    const validated = deviceListResponseSchema.parse({ items, nextCursor });
    reply.code(200);
    return validated;
  });
};

interface DecodedCursor {
  updatedAt: string;
  id: string;
}

function encodeCursor(c: DecodedCursor): string {
  return Buffer.from(`${c.updatedAt}|${c.id}`, 'utf8').toString('base64url');
}

function decodeCursor(cursor: string | undefined): DecodedCursor | null {
  if (!cursor) return null;
  try {
    const raw = Buffer.from(cursor, 'base64url').toString('utf8');
    const [updatedAt, id] = raw.split('|');
    if (!updatedAt || !id) return null;
    return { updatedAt, id };
  } catch {
    return null;
  }
}

function toIso(value: Date | string): string {
  if (value instanceof Date) return value.toISOString();
  return new Date(value).toISOString();
}

function parseDate(value: Date | string): Date {
  if (value instanceof Date) return value;
  return new Date(value);
}

function stringArrayOr(value: unknown, fallback: string[]): string[] {
  if (Array.isArray(value) && value.every((x) => typeof x === 'string')) {
    return value as string[];
  }
  return fallback;
}

function sourceLastSeenOr(
  value: unknown,
  fallback: Record<string, Date>,
): Record<string, Date> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const out: Record<string, Date> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (typeof v === 'string') {
        const d = new Date(v);
        if (Number.isFinite(d.getTime())) out[k] = d;
      } else if (v instanceof Date) {
        out[k] = v;
      }
    }
    return out;
  }
  return fallback;
}
