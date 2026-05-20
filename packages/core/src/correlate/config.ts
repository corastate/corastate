/**
 * Correlation config loader. Reads `configs/correlation.json` (or an
 * override path) and validates against the Zod schema in
 * `@corastate/contracts`. Fail-loudly: the engine refuses to run on a
 * malformed config rather than silently fall back to defaults.
 *
 * The default config below ships with the package so a fresh install can
 * run the engine without any operator action. The on-disk file overrides
 * field-by-field via standard JSON parse semantics.
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { correlationConfigSchema, type CorrelationConfig } from '@corastate/contracts';

/**
 * Ship-default correlation config. Derived from Device Spotlight's
 * defaults (match-priority order; source priority for field resolution).
 *
 * The match-priority list is informational at runtime: the engine
 * applies the algorithm directly. The config exposes it so operators can
 * see what the engine does without reading the source, and so future
 * versions of the engine can swap in alternate orders without a code change.
 */
export const DEFAULT_CORRELATION_CONFIG: CorrelationConfig = {
  matchPriority: [
    { field: 'serialNumber', normalize: 'lowercase+trim' },
    { field: 'azureAdDeviceId', normalize: 'lowercase+trim' },
    { field: 'hostname', normalize: 'lowercase+trim' },
    { field: 'hostname', composite: ['serialNumber'], normalize: 'lowercase+trim' },
    { field: 'macAddresses', normalize: 'lowercase+trim' },
    { field: 'ownerEmail', composite: ['hostname'], normalize: 'lowercase+trim' },
  ],
  sourcePriority: {
    hostname: ['intune', 'defender', 'jamf', 'crowdstrike', 'okta'],
    serialNumber: ['intune', 'defender', 'jamf', 'crowdstrike', 'okta'],
    azureAdDeviceId: ['intune', 'defender'],
    osVersion: ['intune', 'defender', 'jamf', 'crowdstrike', 'okta'],
    diskEncryption: ['intune', 'defender', 'jamf'],
    mdmEnrolled: ['intune', 'defender', 'jamf', 'okta'],
    ownerEmail: ['intune', 'defender', 'okta', 'crowdstrike', 'jamf'],
  },
  compliance: [
    {
      name: 'orphaned',
      description: 'No MDM source has the device.',
      when: { allOf: [{ notIn: ['intune', 'defender', 'jamf'], path: 'sources' }] },
    },
  ],
};

export interface LoadConfigOptions {
  /** Override path. Defaults to <repo>/configs/correlation.json. */
  path?: string;
  /** If the file is missing, use the ship-default. Default true. */
  fallbackOnMissing?: boolean;
}

export async function loadCorrelationConfig(
  options: LoadConfigOptions = {},
): Promise<CorrelationConfig> {
  const configPath = options.path ?? resolveDefaultConfigPath();
  let raw: string;
  try {
    raw = await readFile(configPath, 'utf8');
  } catch (err) {
    if (options.fallbackOnMissing !== false && isFileNotFound(err)) {
      return DEFAULT_CORRELATION_CONFIG;
    }
    throw err;
  }
  const trimmed = raw.trim();
  if (trimmed.length === 0 || trimmed === '{}') {
    // Empty / sentinel file means "use defaults" — the ship config file
    // exists as a placeholder until an operator customizes it.
    return DEFAULT_CORRELATION_CONFIG;
  }
  const parsed = JSON.parse(raw) as unknown;
  return correlationConfigSchema.parse(parsed);
}

function resolveDefaultConfigPath(): string {
  // Resolve relative to the package's compiled location. The package lives
  // at .../packages/core/dist (when built) or .../packages/core/src (when
  // run via tsx). Both resolve up two levels to the repo root.
  const here = fileURLToPath(import.meta.url);
  const repoRoot = path.resolve(path.dirname(here), '..', '..', '..', '..');
  return path.join(repoRoot, 'configs', 'correlation.json');
}

function isFileNotFound(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const code = (err as { code?: unknown }).code;
  return code === 'ENOENT';
}
