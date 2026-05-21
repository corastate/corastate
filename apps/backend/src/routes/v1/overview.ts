/**
 * GET /v1/overview — one aggregated read for the dashboard landing page.
 *
 * Returns: top-line KPIs (device + identity counts, health buckets, orphan
 * + stale counts), per-source coverage (device count + missing-from gap
 * count + last-sync metadata), the compliance distribution, and per-source
 * sync freshness. The dashboard renders all of this without a second round
 * trip.
 *
 * The health bucket is derived in SQL with the same rule documented on
 * deviceHealthSchema. Keeping the rule co-located with the query is the
 * cheapest way to avoid silent drift between the dashboard and the future
 * filtered report.
 */

import { sql } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';

import {
  overviewResponseSchema,
  type OverviewResponse,
  type SourceStatus,
} from '@corastate/contracts';

/** Days a device can go without a check-in before it's considered stale. */
const DEVICE_STALE_DAYS = 14;
/** Hours since the last sync run before a source is considered stale. */
const SOURCE_STALE_HOURS = 24;
/**
 * Connector ids that count as "MDM" for the orphaned-device signal. The
 * demo connectors are included so the seeded dataset surfaces the bucket
 * in the dashboard.
 */
const MDM_CONNECTORS = ['intune', 'defender', 'jamf', 'defender-demo'];

interface KpiRow {
  device_count: string | number;
  identity_count: string | number;
  healthy_count: string | number;
  at_risk_count: string | number;
  unknown_count: string | number;
  orphaned_count: string | number;
  stale_count: string | number;
}

interface CoverageRow {
  id: string;
  name: string;
  connector_id: string;
  active: boolean;
  device_count: string | number;
  missing_count: string | number;
  last_synced_at: Date | string | null;
  last_status: string | null;
}

export const overviewRoutes: FastifyPluginAsync = async (app) => {
  app.get('/overview', async (_request, reply): Promise<OverviewResponse> => {
    const generatedAt = new Date();
    const staleCutoff = new Date(generatedAt.getTime() - DEVICE_STALE_DAYS * 86_400_000);
    const sourceStaleCutoff = new Date(generatedAt.getTime() - SOURCE_STALE_HOURS * 3_600_000);

    // The `?|` jsonb operator returns true when the array on the left
    // contains ANY of the text keys on the right — exactly the predicate
    // for "is this device covered by at least one MDM connector".
    const mdmArray = sql`ARRAY[${sql.join(
      MDM_CONNECTORS.map((c) => sql`${c}`),
      sql`, `,
    )}]::text[]`;

    const [kpiRow] = (await app.db.execute(sql<KpiRow>`
      WITH device_health AS (
        SELECT
          d.id,
          d.last_check_in,
          d.sources,
          CASE
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
          END AS health
        FROM canonical_devices d
      )
      SELECT
        (SELECT COUNT(*) FROM canonical_devices)::bigint AS device_count,
        (SELECT COUNT(*) FROM entities WHERE kind = 'identity')::bigint AS identity_count,
        COUNT(*) FILTER (WHERE health = 'healthy')::bigint AS healthy_count,
        COUNT(*) FILTER (WHERE health = 'at_risk')::bigint AS at_risk_count,
        COUNT(*) FILTER (WHERE health = 'unknown')::bigint AS unknown_count,
        COUNT(*) FILTER (WHERE NOT (sources ?| ${mdmArray}))::bigint AS orphaned_count,
        COUNT(*) FILTER (
          WHERE last_check_in IS NOT NULL AND last_check_in < ${staleCutoff.toISOString()}::timestamptz
        )::bigint AS stale_count
      FROM device_health
    `)) as unknown as KpiRow[];

    const coverageRows = (await app.db.execute(sql<CoverageRow>`
      SELECT
        s.id::text                                                       AS id,
        s.display_name                                                   AS name,
        s.connector_id                                                   AS connector_id,
        s.active                                                         AS active,
        COALESCE((
          SELECT COUNT(*)
          FROM canonical_devices d
          WHERE d.sources @> jsonb_build_array(s.connector_id)
        ), 0)::bigint                                                    AS device_count,
        COALESCE((
          SELECT COUNT(*)
          FROM canonical_devices d
          WHERE d.missing_from @> jsonb_build_array(s.connector_id)
        ), 0)::bigint                                                    AS missing_count,
        latest.started_at                                                AS last_synced_at,
        latest.status::text                                              AS last_status
      FROM sources s
      LEFT JOIN LATERAL (
        SELECT started_at, status
        FROM sync_runs
        WHERE source_id = s.id
        ORDER BY started_at DESC
        LIMIT 1
      ) latest ON TRUE
      ORDER BY s.created_at ASC, s.id ASC
    `)) as unknown as CoverageRow[];

    const sourceCoverage = coverageRows.map((row) => {
      const lastSyncedAt = row.last_synced_at ? new Date(row.last_synced_at) : null;
      const status = toSourceStatus(row.last_status);
      return {
        id: row.id,
        name: row.name,
        connectorId: row.connector_id,
        active: row.active,
        deviceCount: Number(row.device_count),
        missingCount: Number(row.missing_count),
        lastSyncedAt,
        status,
        stale: lastSyncedAt === null || lastSyncedAt < sourceStaleCutoff,
      };
    });

    const syncFreshness = sourceCoverage.map((row) => ({
      sourceId: row.id,
      sourceName: row.name,
      connectorId: row.connectorId,
      lastSyncedAt: row.lastSyncedAt,
      status: row.status,
      ageSeconds: row.lastSyncedAt
        ? Math.max(0, Math.floor((generatedAt.getTime() - row.lastSyncedAt.getTime()) / 1000))
        : null,
      stale: row.stale,
    }));

    const kpis = kpiRow ?? {
      device_count: 0,
      identity_count: 0,
      healthy_count: 0,
      at_risk_count: 0,
      unknown_count: 0,
      orphaned_count: 0,
      stale_count: 0,
    };

    const response: OverviewResponse = {
      generatedAt,
      kpis: {
        deviceCount: Number(kpis.device_count),
        identityCount: Number(kpis.identity_count),
        healthyCount: Number(kpis.healthy_count),
        atRiskCount: Number(kpis.at_risk_count),
        unknownCount: Number(kpis.unknown_count),
        orphanedCount: Number(kpis.orphaned_count),
        staleCount: Number(kpis.stale_count),
        staleThresholdDays: DEVICE_STALE_DAYS,
      },
      sourceCoverage,
      healthDistribution: {
        healthy: Number(kpis.healthy_count),
        atRisk: Number(kpis.at_risk_count),
        unknown: Number(kpis.unknown_count),
      },
      syncFreshness,
      thresholds: {
        deviceStaleDays: DEVICE_STALE_DAYS,
        sourceStaleHours: SOURCE_STALE_HOURS,
      },
    };

    const validated = overviewResponseSchema.parse(response);
    reply.code(200);
    return validated;
  });
};

function toSourceStatus(raw: string | null): SourceStatus {
  if (raw === null) return 'idle';
  switch (raw) {
    case 'running':
    case 'succeeded':
    case 'failed':
    case 'cancelled':
      return raw;
    default:
      return 'idle';
  }
}
