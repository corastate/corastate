/**
 * Write helpers for the observation log.
 *
 * Everything goes through here so we have one place to enforce the batching
 * policy, the JSONB shape of the value column, and the timestamp default.
 */

import type { Database } from '@corastate/db';
import { observations, type NewObservation } from '@corastate/db';
import type { Observation as SdkObservation } from '@corastate/connector-sdk';

const DEFAULT_BATCH_SIZE = 500;

export interface WriteObservationsOptions {
  /** sync_run_id the framework allocated for this run. Required. */
  syncRunId: string;
  /** Insert in chunks of this size. Default 500. */
  batchSize?: number;
}

/**
 * Write a stream of observations from a connector. Buffers up to batchSize
 * rows, flushes, repeats. Returns the total count written.
 *
 * Callers should pass the async iterable they got back from `connector.sync`
 * directly: this function never holds more than one batch in memory at a time.
 */
export async function writeObservations(
  db: Database,
  source: AsyncIterable<SdkObservation>,
  options: WriteObservationsOptions,
): Promise<number> {
  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
  let buffer: NewObservation[] = [];
  let total = 0;

  for await (const obs of source) {
    if (!obs.entityId) {
      // The correlation engine assigns an entity id when it decides two
      // source records are the same underlying thing. Until that runs we
      // cannot insert. TODO: wire `correlate` in here.
      throw new Error(
        'writeObservations got an observation with no entityId. ' +
          'Run the correlation engine before writing, or pass observations through correlate().',
      );
    }
    buffer.push({
      observedAt: obs.observedAt ?? new Date(),
      source: obs.source,
      sourceRecordId: obs.sourceRecordId,
      entityKind: obs.entityKind,
      entityId: obs.entityId,
      attribute: obs.attribute,
      value: obs.value as NewObservation['value'],
      syncRunId: options.syncRunId,
    });

    if (buffer.length >= batchSize) {
      await db.insert(observations).values(buffer);
      total += buffer.length;
      buffer = [];
    }
  }

  if (buffer.length > 0) {
    await db.insert(observations).values(buffer);
    total += buffer.length;
  }

  return total;
}
