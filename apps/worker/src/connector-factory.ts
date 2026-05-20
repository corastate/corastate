/**
 * Build a Connector instance for a configured source. Lookup is by
 * `connector_id` from the sources row; per-source config overrides (e.g.
 * baseUrl, tenant id) are passed through.
 *
 * Phase 1 Week 3 ships Okta and Defender as fully authored connectors.
 * The three skeleton connectors (CrowdStrike, Intune, Jamf) remain stubs
 * until later phases. Unknown ids fail loudly so a misconfigured source
 * row doesn't silently no-op.
 */

import { createDefenderConnector } from '@corastate/connector-defender';
import { createOktaConnector } from '@corastate/connector-okta';
import type { Connector } from '@corastate/connector-sdk';

export interface OktaSourceConfig {
  /** Per-tenant base URL, e.g. https://acme.okta.com. */
  baseUrl: string;
}

export interface DefenderSourceConfig {
  /** Azure AD tenant id (uuid). Embedded in the OAuth token URL. */
  tenantId: string;
}

export type SourceConfig = OktaSourceConfig | DefenderSourceConfig | Record<string, unknown>;

export interface BuildConnectorInput {
  connectorId: string;
  config: Record<string, unknown>;
}

export function buildConnector(input: BuildConnectorInput): Connector {
  switch (input.connectorId) {
    case 'okta': {
      const cfg = input.config as Partial<OktaSourceConfig>;
      if (!cfg.baseUrl || typeof cfg.baseUrl !== 'string') {
        throw new Error(
          `buildConnector: 'okta' source is missing a baseUrl string in its config.`,
        );
      }
      return createOktaConnector({ baseUrl: cfg.baseUrl });
    }
    case 'defender': {
      const cfg = input.config as Partial<DefenderSourceConfig>;
      if (!cfg.tenantId || typeof cfg.tenantId !== 'string') {
        throw new Error(
          `buildConnector: 'defender' source is missing a tenantId string in its config.`,
        );
      }
      return createDefenderConnector({ tenantId: cfg.tenantId });
    }
    default:
      throw new Error(
        `buildConnector: no connector registered for id '${input.connectorId}'. ` +
          'Phase 1 ships okta and defender; crowdstrike/intune/jamf land in later phases.',
      );
  }
}
