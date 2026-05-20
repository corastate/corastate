/**
 * GET /v1/identities — paginated list of identities materialized from the
 * current_state view.
 *
 * Per the v3 data model (architecture-v3 §"The observation-log data model"),
 * current_state stores one row per (entity_id, source, attribute). This
 * handler pivots it into one identity per entity by:
 *   1. Picking the candidate entities (kind='identity') in updated_at desc
 *      order, with cursor + fuzzy filter applied.
 *   2. Aggregating the JSONB values of the canonical attributes into one
 *      object per entity using `jsonb_object_agg(attribute, value)`.
 *   3. Shaping the aggregated object into the canonical Identity record
 *      and validating it through the contracts package.
 *
 * Cursor pagination uses (updated_at, id) for stability across writes; the
 * cursor is opaque base64url.
 */

import { sql } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';

import {
  cursorPageQuerySchema,
  identityListResponseSchema,
  type IdentityListItem,
  type IdentityListResponse,
} from '@corastate/contracts';

export const identitiesRoutes: FastifyPluginAsync = async (app) => {
  app.get('/identities', async (request, reply): Promise<IdentityListResponse> => {
    const parsed = cursorPageQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      reply.code(400);
      return reply.send({
        error: 'invalid_query',
        details: parsed.error.flatten(),
      }) as unknown as IdentityListResponse;
    }
    const { limit, cursor, q } = parsed.data;
    const cursorDecoded = decodeCursor(cursor);
    const fuzzy = q ? `%${q.toLowerCase()}%` : null;

    const rows = await app.db.execute(sql<{
      id: string;
      updated_at: string;
      attrs: Record<string, unknown>;
    }>`
      WITH page AS (
        SELECT e.id, e.updated_at
        FROM entities e
        WHERE e.kind = 'identity'
          ${cursorDecoded
            ? sql`AND (e.updated_at, e.id) < (${cursorDecoded.updatedAt}::timestamptz, ${cursorDecoded.id}::uuid)`
            : sql``}
          ${fuzzy
            ? sql`AND EXISTS (
              SELECT 1 FROM current_state cs
              WHERE cs.entity_id = e.id
                AND cs.attribute IN ('email','displayName')
                AND lower(cs.value #>> '{}') LIKE ${fuzzy}
            )`
            : sql``}
        ORDER BY e.updated_at DESC, e.id DESC
        LIMIT ${limit + 1}
      )
      SELECT
        page.id::text AS id,
        page.updated_at,
        COALESCE(
          jsonb_object_agg(cs.attribute, cs.value) FILTER (WHERE cs.attribute IS NOT NULL),
          '{}'::jsonb
        ) AS attrs
      FROM page
      LEFT JOIN current_state cs ON cs.entity_id = page.id
      GROUP BY page.id, page.updated_at
      ORDER BY page.updated_at DESC, page.id DESC
    `);

    const candidates = rows as unknown as Array<{
      id: string;
      updated_at: string;
      attrs: Record<string, unknown>;
    }>;

    // Device count is derived from canonical_devices.owner_email.
    // Computed in one query per page (not per row) so we don't fan out into
    // N+1 selects when listing 50 identities. The list of emails is built
    // into the IN clause via sql.join — postgres.js doesn't bind JS arrays
    // to PG `text[]` cleanly through Drizzle, so an explicit list keeps the
    // generated SQL straightforward.
    const emailsLowercased: string[] = [];
    for (const row of candidates) {
      const email = stringOrNull(row.attrs?.email);
      if (email) emailsLowercased.push(email.toLowerCase());
    }
    const deviceCountByEmail = new Map<string, number>();
    if (emailsLowercased.length > 0) {
      const inList = sql.join(emailsLowercased.map((e) => sql`${e}`), sql.raw(', '));
      const countRows = (await app.db.execute(sql<{
        owner_email: string;
        n: string | number;
      }>`
        SELECT lower(owner_email) AS owner_email, COUNT(*) AS n
        FROM canonical_devices
        WHERE owner_email IS NOT NULL
          AND lower(owner_email) IN (${inList})
        GROUP BY lower(owner_email)
      `)) as unknown as Array<{ owner_email: string; n: string | number }>;
      for (const r of countRows) {
        deviceCountByEmail.set(r.owner_email, Number(r.n));
      }
    }

    const hasMore = candidates.length > limit;
    const page = hasMore ? candidates.slice(0, limit) : candidates;
    const nextCursor = hasMore
      ? encodeCursor({
          updatedAt: toIso(page[page.length - 1]!.updated_at),
          id: page[page.length - 1]!.id,
        })
      : null;

    const items: IdentityListItem[] = [];
    for (const row of page) {
      const attrs = row.attrs ?? {};
      const email = stringOrNull(attrs.email);
      // current_state can hold partial identities (no email observed yet for
      // this entity). Drop those from the /v1 surface; they reappear once a
      // sync writes the email observation. The /internal surface (later)
      // shows incomplete entities.
      if (!email || !email.includes('@')) continue;
      items.push({
        id: row.id,
        email,
        displayName: stringOrNull(attrs.displayName),
        status: parseStatus(stringOrNull(attrs.status)),
        lastLogin: parseDate(stringOrNull(attrs.lastLogin)),
        sources: stringArrayOr(attrs.sources, []),
        vendorIds: vendorIdsOr(attrs.vendorIds, {}),
        deviceCount: deviceCountByEmail.get(email.toLowerCase()) ?? 0,
      });
    }

    const validated = identityListResponseSchema.parse({ items, nextCursor });
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

function stringOrNull(v: unknown): string | null {
  if (typeof v === 'string') return v;
  return null;
}

function stringArrayOr(v: unknown, fallback: string[]): string[] {
  if (Array.isArray(v) && v.every((x) => typeof x === 'string')) return v as string[];
  return fallback;
}

function vendorIdsOr(v: unknown, fallback: Record<string, string>): Record<string, string> {
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    const out: Record<string, string> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (typeof val === 'string') out[k] = val;
    }
    return out;
  }
  return fallback;
}

function parseStatus(raw: string | null): IdentityListItem['status'] {
  if (raw === 'active' || raw === 'suspended' || raw === 'deactivated' || raw === 'unknown') {
    return raw;
  }
  return 'unknown';
}

function parseDate(raw: string | null): Date | null {
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isFinite(d.getTime()) ? d : null;
}
