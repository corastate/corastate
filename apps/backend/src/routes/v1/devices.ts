/**
 * GET /v1/devices — cursor-paginated list of correlated devices from
 * `canonical_devices`, with optional facet filters + sort.
 *
 * The base filter (Week 3) was a fuzzy hostname/owner search. Week 4 extends
 * this into a faceted report surface:
 *   - sources / missingFrom  — jsonb containment against the canonical row's
 *                              source-coverage arrays.
 *   - compliance             — server-derived bucket using the same rule the
 *                              overview endpoint applies (see
 *                              deviceHealthSchema's contract docs).
 *   - platform               — coarse OS family bucket, matched
 *                              case-insensitively against os_version.
 *   - hasGaps / staleOnly    — boolean shortcuts that fold into the
 *                              missing-from / last-check-in predicates.
 *
 * Cursor pagination uses (sort_key, id) for stability across writes. The
 * cursor is opaque base64url.
 */

import { sql, type SQL } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';

import {
  deviceListQuerySchema,
  deviceListResponseSchema,
  type Device,
  type DeviceListResponse,
  type DeviceSortField,
  type SortDirection,
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
  source_count: number | string;
  sort_value: string | null;
}

const DEVICE_STALE_DAYS = 14;
const MDM_CONNECTORS = ['intune', 'defender', 'jamf', 'defender-demo'];

interface SortPlan {
  /** SQL expression used in both the SELECT (as `sort_value`) and the ORDER BY. */
  expr: SQL;
  /** ASC / DESC. */
  dir: SortDirection;
  /** Whether the cursor uses text comparison (vs. timestamptz). */
  textKey: boolean;
}

function buildSortPlan(field: DeviceSortField, dir: SortDirection): SortPlan {
  switch (field) {
    case 'hostname':
      return { expr: sql`lower(coalesce(d.hostname, ''))`, dir, textKey: true };
    case 'ownerEmail':
      return { expr: sql`lower(coalesce(d.owner_email, ''))`, dir, textKey: true };
    case 'osVersion':
      return { expr: sql`lower(coalesce(d.os_version, ''))`, dir, textKey: true };
    case 'sourceCount':
      return {
        expr: sql`lpad((coalesce(jsonb_array_length(d.sources), 0))::text, 6, '0')`,
        dir,
        textKey: true,
      };
    case 'lastCheckIn':
      // Use an ISO-formatted text so the cursor encoding stays text-only.
      // NULL last_check_in sorts to a sentinel that always loses against
      // any real timestamp on either direction.
      return {
        expr: sql`coalesce(to_char(d.last_check_in AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'), ${
          dir === 'desc' ? '0000-00-00T00:00:00.000000Z' : '9999-99-99T99:99:99.999999Z'
        })`,
        dir,
        textKey: true,
      };
    case 'updatedAt':
    default:
      return {
        expr: sql`to_char(d.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
        dir,
        textKey: true,
      };
  }
}

function platformPredicate(platform: string): SQL | null {
  const p = platform.toLowerCase();
  if (p === 'macos' || p === 'mac' || p === 'darwin') {
    return sql`lower(coalesce(d.os_version, '')) LIKE '%mac%'`;
  }
  if (p === 'windows' || p === 'win') {
    return sql`lower(coalesce(d.os_version, '')) LIKE '%windows%'`;
  }
  if (p === 'linux') {
    return sql`lower(coalesce(d.os_version, '')) LIKE '%linux%'`;
  }
  if (p === 'ios') {
    return sql`lower(coalesce(d.os_version, '')) LIKE '%ios%'`;
  }
  if (p === 'android') {
    return sql`lower(coalesce(d.os_version, '')) LIKE '%android%'`;
  }
  if (p === 'other' || p === 'unknown') {
    return sql`NOT (
      lower(coalesce(d.os_version, '')) LIKE '%mac%'
      OR lower(coalesce(d.os_version, '')) LIKE '%windows%'
      OR lower(coalesce(d.os_version, '')) LIKE '%linux%'
      OR lower(coalesce(d.os_version, '')) LIKE '%ios%'
      OR lower(coalesce(d.os_version, '')) LIKE '%android%'
    )`;
  }
  return null;
}

function healthExpr(): SQL {
  const mdmArray = sql`ARRAY[${sql.join(
    MDM_CONNECTORS.map((c) => sql`${c}`),
    sql`, `,
  )}]::text[]`;
  return sql`(CASE
    WHEN d.disk_encryption IS TRUE
      AND d.mdm_enrolled IS TRUE
      AND d.agent_running IS TRUE
      AND COALESCE(jsonb_array_length(d.missing_from), 0) = 0
      THEN 'healthy'
    WHEN d.disk_encryption IS NULL
      AND d.mdm_enrolled IS NULL
      AND d.agent_running IS NULL
      AND NOT (d.sources ?| ${mdmArray})
      THEN 'unknown'
    ELSE 'at_risk'
  END)`;
}

export const devicesRoutes: FastifyPluginAsync = async (app) => {
  app.get('/devices', async (request, reply): Promise<DeviceListResponse> => {
    const parsed = deviceListQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      reply.code(400);
      return reply.send({
        error: 'invalid_query',
        details: parsed.error.flatten(),
      }) as unknown as DeviceListResponse;
    }
    const {
      limit,
      cursor,
      q,
      sources: sourceFilter,
      missingFrom: missingFilter,
      compliance,
      platform,
      hasGaps,
      staleOnly,
      sort,
      dir,
    } = parsed.data;
    const cursorDecoded = decodeCursor(cursor);
    const fuzzy = q ? `%${q.toLowerCase()}%` : null;

    const sortPlan = buildSortPlan(sort, dir);
    const staleCutoff = new Date(Date.now() - DEVICE_STALE_DAYS * 86_400_000);

    const conditions: SQL[] = [sql`TRUE`];

    if (fuzzy) {
      conditions.push(sql`(
        lower(coalesce(d.hostname, '')) LIKE ${fuzzy}
        OR lower(coalesce(d.owner_email, '')) LIKE ${fuzzy}
      )`);
    }
    if (sourceFilter && sourceFilter.length > 0) {
      const arr = JSON.stringify(sourceFilter);
      conditions.push(sql`d.sources @> ${arr}::jsonb`);
    }
    if (missingFilter && missingFilter.length > 0) {
      const arr = JSON.stringify(missingFilter);
      conditions.push(sql`d.missing_from @> ${arr}::jsonb`);
    }
    if (hasGaps === true) {
      conditions.push(sql`COALESCE(jsonb_array_length(d.missing_from), 0) > 0`);
    }
    if (staleOnly === true) {
      conditions.push(
        sql`(d.last_check_in IS NULL OR d.last_check_in < ${staleCutoff.toISOString()}::timestamptz)`,
      );
    }
    if (platform && platform.length > 0) {
      const platformPredicates = platform
        .map((p) => platformPredicate(p))
        .filter((p): p is SQL => p !== null);
      if (platformPredicates.length > 0) {
        conditions.push(
          sql`(${sql.join(platformPredicates, sql` OR `)})`,
        );
      }
    }
    if (compliance && compliance.length > 0) {
      const valid = compliance.filter(
        (c): c is 'healthy' | 'at_risk' | 'unknown' =>
          c === 'healthy' || c === 'at_risk' || c === 'unknown',
      );
      if (valid.length > 0) {
        const list = sql.join(
          valid.map((c) => sql`${c}`),
          sql`, `,
        );
        conditions.push(sql`${healthExpr()} IN (${list})`);
      }
    }

    if (cursorDecoded) {
      const cmp = sortPlan.dir === 'desc' ? sql`<` : sql`>`;
      conditions.push(
        sql`(${sortPlan.expr}, d.id::text) ${cmp} (${cursorDecoded.sortValue}, ${cursorDecoded.id})`,
      );
    }

    const whereClause = sql.join(conditions, sql` AND `);
    const orderDir = sortPlan.dir === 'desc' ? sql`DESC` : sql`ASC`;

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
        d.updated_at           AS updated_at,
        COALESCE(jsonb_array_length(d.sources), 0) AS source_count,
        (${sortPlan.expr})::text AS sort_value
      FROM canonical_devices d
      WHERE ${whereClause}
      ORDER BY (${sortPlan.expr}) ${orderDir}, d.id ${orderDir}
      LIMIT ${limit + 1}
    `)) as unknown as CanonicalDeviceRow[];

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];
    const nextCursor = hasMore && last
      ? encodeCursor({ sortValue: last.sort_value ?? '', id: last.id })
      : null;

    let total: number | undefined;
    if (!cursorDecoded) {
      // Only compute the total on the first page — every subsequent page
      // would repeat the same expensive count for no UI benefit. The
      // contract documents that omission.
      const totalRows = (await app.db.execute(sql<{ count: string | number }>`
        SELECT COUNT(*)::bigint AS count
        FROM canonical_devices d
        WHERE ${whereClause}
      `)) as unknown as Array<{ count: string | number }>;
      total = Number(totalRows[0]?.count ?? 0);
    }

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

    const validated = deviceListResponseSchema.parse({ items, nextCursor, ...(total !== undefined ? { total } : {}) });
    reply.code(200);
    return validated;
  });
};

interface DecodedCursor {
  sortValue: string;
  id: string;
}

function encodeCursor(c: DecodedCursor): string {
  return Buffer.from(`${c.sortValue}|${c.id}`, 'utf8').toString('base64url');
}

function decodeCursor(cursor: string | undefined): DecodedCursor | null {
  if (!cursor) return null;
  try {
    const raw = Buffer.from(cursor, 'base64url').toString('utf8');
    const sep = raw.lastIndexOf('|');
    if (sep < 0) return null;
    const sortValue = raw.slice(0, sep);
    const id = raw.slice(sep + 1);
    if (!id) return null;
    return { sortValue, id };
  } catch {
    return null;
  }
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
