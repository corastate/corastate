/**
 * Correlation engine skeleton.
 *
 * The job: given a stream of observations coming out of a connector, decide
 * which Corastate-internal entity each one belongs to. Stamp an entityId on
 * the observation before it gets written.
 *
 * Strategy (sketch, not implemented):
 *   1. For devices: try (serial_number), then (hardware_uuid), then (hostname + mac).
 *   2. For identities: try (email_lower), then (vendor_user_id namespaced by source).
 *   3. For agents: tie to a device by (hostname) or (sensor_id) when the
 *      vendor exposes a back-link.
 *
 * The matcher writes a row in `entities` the first time it sees a record and
 * caches the result in-process so a single sync run does not hit the database
 * once per observation.
 */

import type { Database } from '@corastate/db';
import type { Observation as SdkObservation } from '@corastate/connector-sdk';

export interface CorrelateOptions {
  /** Run id, recorded on any new entities the matcher creates. */
  syncRunId: string;
}

/**
 * Stamp entityId on each observation in the stream.
 *
 * Today this is a placeholder that throws if any observation arrives without
 * an entityId pre-set. The real implementation reads from `entities` and the
 * recent observation history to decide whether to reuse an existing id or
 * mint a new one.
 *
 * TODO: implement. Until then, connectors should set entityId themselves
 * (most can use the vendor's record id as a deterministic UUID v5).
 */
export async function* correlate(
  _db: Database,
  source: AsyncIterable<SdkObservation>,
  _options: CorrelateOptions,
): AsyncIterable<SdkObservation> {
  for await (const obs of source) {
    if (obs.entityId) {
      yield obs;
      continue;
    }
    // TODO: lookup or insert into `entities` and assign the resulting id.
    throw new Error(
      `correlate(): observation from ${obs.source} record=${obs.sourceRecordId} ` +
        `has no entityId and the matcher is not implemented yet.`,
    );
  }
}
