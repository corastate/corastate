/**
 * Build a Connector instance for a configured source. Lookup is by
 * `connector_id` from the sources row; per-source config overrides (e.g.
 * baseUrl) are passed through.
 *
 * The Phase 1 plan ships Okta as a fully authored connector; Defender lands
 * in Week 3 and the three skeleton connectors (CrowdStrike, Intune, Jamf)
 * land in later phases. Unknown ids fail loudly so a misconfigured source
 * row doesn't silently no-op.
 */

import { createOktaConnector } from '@corastate/connector-okta';
import type { Connector } from '@corastate/connector-sdk';

export interface SourceConfig {
  /** Per-tenant base URL. Required for every connector that does HTTP. */
  baseUrl: string;
}

export interface BuildConnectorInput {
  connectorId: string;
  config: Record<string, unknown>;
}

export function buildConnector(input: BuildConnectorInput): Connector {
  const config = input.config as Partial<SourceConfig>;
  if (!config.baseUrl || typeof config.baseUrl !== 'string') {
    throw new Error(
      `buildConnector: source config for '${input.connectorId}' is missing a baseUrl string.`,
    );
  }
  switch (input.connectorId) {
    case 'okta':
      return createOktaConnector({ baseUrl: config.baseUrl });
    default:
      throw new Error(
        `buildConnector: no connector registered for id '${input.connectorId}'. ` +
          'Phase 1 ships okta as fully authored; defender lands in Week 3.',
      );
  }
}
