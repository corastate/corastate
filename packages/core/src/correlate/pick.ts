/**
 * Source-priority field resolution. When two sources observe different
 * values for the same canonical field, the engine consults the configured
 * per-field source priority list and returns the first present value.
 *
 * Ported from `pick_best_field` in Device Spotlight's correlator.py.
 */

import type { DeviceObservation } from './read.js';

export type FieldValue = string | boolean | Date | string[] | null;

export interface PickInput<TValue> {
  devices: DeviceObservation[];
  /** Per-field ordered list of source ids (e.g. ['defender','okta']). */
  priority: string[];
  /** How to extract the canonical value from a per-source record. */
  extract: (dev: DeviceObservation) => TValue | null;
}

export function pickBestField<TValue>(input: PickInput<TValue>): TValue | null {
  // Sources listed in `priority` come first, in order. Sources not listed
  // fall back to the order the devices appear in (typically observation
  // order, which is sync-run order).
  const seen = new Set<string>();
  const ordered: DeviceObservation[] = [];
  for (const src of input.priority) {
    for (const dev of input.devices) {
      if (dev.source === src && !seen.has(dev.entityId)) {
        ordered.push(dev);
        seen.add(dev.entityId);
      }
    }
  }
  for (const dev of input.devices) {
    if (!seen.has(dev.entityId)) {
      ordered.push(dev);
      seen.add(dev.entityId);
    }
  }
  for (const dev of ordered) {
    const value = input.extract(dev);
    if (value === null || value === undefined) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if (typeof value === 'string' && value.length === 0) continue;
    return value;
  }
  return null;
}

/**
 * Union of MAC addresses across all sources, in priority-then-first-seen
 * order. MACs are a multi-valued field: rather than picking one source's
 * list, the canonical record aggregates every MAC any source has seen.
 */
export function unionMacAddresses(devices: DeviceObservation[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const dev of devices) {
    for (const mac of dev.macAddresses) {
      if (!seen.has(mac)) {
        seen.add(mac);
        out.push(mac);
      }
    }
  }
  return out;
}

/**
 * Most-recent timestamp across all sources. Returns null when no source
 * reported a check-in.
 */
export function mostRecentCheckIn(devices: DeviceObservation[]): Date | null {
  let best: Date | null = null;
  for (const dev of devices) {
    if (!dev.lastCheckIn) continue;
    if (!best || dev.lastCheckIn.getTime() > best.getTime()) {
      best = dev.lastCheckIn;
    }
  }
  return best;
}
