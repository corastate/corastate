// Mapping piece. The one place in a connector that is per-vendor code; the
// segmented skeleton (architecture-v3.md §"The segmented connector skeleton")
// confines vendor quirks to small, pure, unit-testable functions.

import type { DevicePartial } from '@corastate/contracts';
import type { IdentityPartial } from '@corastate/contracts';

export type MappingFn<TRaw, TOut> = (raw: TRaw) => TOut;

/**
 * Optional per-entity-kind mapping functions. A connector populates the kinds
 * it produces and leaves the rest undefined.
 */
export interface ConnectorMapping {
  device?: MappingFn<unknown, DevicePartial>;
  identity?: MappingFn<unknown, IdentityPartial>;
}
