// Shapes for /v1/overview — the aggregated landing-page view.
//
// The endpoint stitches together counts and timestamps from
// canonical_devices, identities (via entities), sources, and sync_runs into
// one response so the dashboard never makes N round trips. Health categories
// are derived server-side from the canonical_devices flags + missing_from
// gaps, not stored: keep the rule next to the query so the dashboard and any
// future report agree on what "at risk" means.

import { z } from 'zod';

import { sourceStatusSchema } from './api.js';

export const deviceHealthSchema = z
  .enum(['healthy', 'at_risk', 'unknown'])
  .describe(
    'Derived health bucket. healthy: all of disk_encryption / mdm_enrolled / agent_running ' +
      'are true AND missing_from is empty. unknown: every flag is null AND no MDM source has ' +
      'observed the device. at_risk: anything else (a flag is false, a flag is unknown but ' +
      'another sources reports it, or there is a cross-source gap).',
  );
export type DeviceHealth = z.infer<typeof deviceHealthSchema>;

export const overviewKpisSchema = z.object({
  deviceCount: z.number().int().nonnegative(),
  identityCount: z.number().int().nonnegative(),
  healthyCount: z.number().int().nonnegative(),
  atRiskCount: z.number().int().nonnegative(),
  unknownCount: z.number().int().nonnegative(),
  orphanedCount: z
    .number()
    .int()
    .nonnegative()
    .describe(
      'Devices whose owner is present in an identity source but the device is in zero MDM ' +
        'sources (intune, defender, jamf, defender-demo). The seed-side "okta only" devices ' +
        'fall in this bucket.',
    ),
  staleCount: z
    .number()
    .int()
    .nonnegative()
    .describe('Devices whose last_check_in is older than the staleness threshold.'),
  staleThresholdDays: z
    .number()
    .int()
    .positive()
    .describe('The threshold the count above was computed against.'),
});
export type OverviewKpis = z.infer<typeof overviewKpisSchema>;

export const sourceCoverageItemSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  connectorId: z.string(),
  active: z.boolean(),
  deviceCount: z.number().int().nonnegative().describe('Distinct canonical_devices the source has observed.'),
  missingCount: z
    .number()
    .int()
    .nonnegative()
    .describe('Devices whose missing_from array contains this source.'),
  lastSyncedAt: z.coerce.date().nullable(),
  status: sourceStatusSchema,
  stale: z
    .boolean()
    .describe('True when lastSyncedAt is older than the source-staleness threshold (or never synced).'),
});
export type SourceCoverageItem = z.infer<typeof sourceCoverageItemSchema>;

export const syncFreshnessItemSchema = z.object({
  sourceId: z.string().uuid(),
  sourceName: z.string(),
  connectorId: z.string(),
  lastSyncedAt: z.coerce.date().nullable(),
  status: sourceStatusSchema,
  ageSeconds: z
    .number()
    .nonnegative()
    .nullable()
    .describe('Seconds since lastSyncedAt at the moment the response was built. Null if never synced.'),
  stale: z.boolean(),
});
export type SyncFreshnessItem = z.infer<typeof syncFreshnessItemSchema>;

export const healthDistributionSchema = z.object({
  healthy: z.number().int().nonnegative(),
  atRisk: z.number().int().nonnegative(),
  unknown: z.number().int().nonnegative(),
});
export type HealthDistribution = z.infer<typeof healthDistributionSchema>;

export const overviewResponseSchema = z.object({
  generatedAt: z.coerce.date(),
  kpis: overviewKpisSchema,
  sourceCoverage: z.array(sourceCoverageItemSchema),
  healthDistribution: healthDistributionSchema,
  syncFreshness: z.array(syncFreshnessItemSchema),
  thresholds: z.object({
    deviceStaleDays: z.number().int().positive(),
    sourceStaleHours: z.number().int().positive(),
  }),
});
export type OverviewResponse = z.infer<typeof overviewResponseSchema>;
