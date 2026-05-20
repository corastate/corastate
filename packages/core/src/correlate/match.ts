/**
 * Build the correlation map. Ported from the upstream correlator's
 * `build_correlation_map` (Device Spotlight `correlator.py`); same five-step
 * match priority and the same merge invariants:
 *
 *   1. Exact serial number (already normalized upstream by readDeviceObservations).
 *   2. Azure AD device id — strong signal for Entra-joined Windows endpoints.
 *   3. Hostname, only when unambiguous (at most one real-serial group claims it).
 *   4. Serial-in-hostname boundary match for `HOSTNAME-<serial>` patterns; min 8 chars.
 *   5. MAC address, only when unambiguous.
 *   6. Email + hostname composite.
 *
 * Merge invariants preserved from the source:
 *   A1: Never merge two groups that both have a real-serial key — that would
 *       conflate distinct hardware identifiers.
 *   A4: Hostname-driven merges only collapse synthetic groups into real-
 *       serial groups, never real into real, and never the reverse.
 *   A5: Serial-in-hostname merges are collected in one pass and applied in a
 *       second pass to prevent the cascade where merging A→B then re-reading
 *       B's hosts pulls in an unrelated C.
 */

import { isSyntheticKey, serialAtBoundary, syntheticKey } from './normalize.js';
import type { DeviceObservation } from './read.js';

export interface MatchGroups {
  /** Map from match-key (serial or synthetic) to the device observations that fall under it. */
  groups: Map<string, DeviceObservation[]>;
}

const MIN_SERIAL_LENGTH_FOR_HOSTNAME_MATCH = 8;

export function buildCorrelationMap(devices: DeviceObservation[]): MatchGroups {
  const groups = new Map<string, DeviceObservation[]>();
  const noSerial: DeviceObservation[] = [];

  for (const dev of devices) {
    if (dev.serialNumber) {
      pushIntoGroup(groups, dev.serialNumber, dev);
    } else {
      noSerial.push(dev);
    }
  }

  // Build lookup maps from the serial-keyed groups. Sets detect ambiguity:
  // a hostname or MAC that points at more than one serial is dropped from
  // the match-priority list (A4).
  const hostnameToSerials = new Map<string, Set<string>>();
  const macToSerials = new Map<string, Set<string>>();
  const azureAdToSerial = new Map<string, string>();
  const emailHostToSerial = new Map<string, string>();

  for (const [sn, members] of groups) {
    for (const dev of members) {
      const hn = dev.hostnameNormalized;
      if (hn) addToSetMap(hostnameToSerials, hn, sn);
      for (const mac of dev.macAddresses) addToSetMap(macToSerials, mac, sn);
      if (dev.azureAdDeviceId) azureAdToSerial.set(dev.azureAdDeviceId, sn);
      const email = (dev.ownerEmail ?? '').toLowerCase().trim();
      if (email && hn) emailHostToSerial.set(`${email}|${hn}`, sn);
    }
  }

  const serialKeysSorted = Array.from(groups.keys()).sort();

  for (const dev of noSerial) {
    const hn = dev.hostnameNormalized;
    const email = (dev.ownerEmail ?? '').toLowerCase().trim();
    let matched: string | null = null;

    // 1. Azure AD device id.
    if (dev.azureAdDeviceId) {
      matched = azureAdToSerial.get(dev.azureAdDeviceId) ?? null;
    }
    // 2. Hostname (unambiguous only).
    if (!matched && hn) {
      const candidates = hostnameToSerials.get(hn);
      if (candidates && candidates.size === 1) {
        matched = Array.from(candidates)[0] ?? null;
      }
    }
    // 3. Serial-in-hostname (min length 8).
    if (!matched && hn) {
      for (const sn of serialKeysSorted) {
        if (sn.length >= MIN_SERIAL_LENGTH_FOR_HOSTNAME_MATCH && serialAtBoundary(sn, hn)) {
          matched = sn;
          break;
        }
      }
    }
    // 4. MAC (unambiguous only).
    if (!matched) {
      for (const mac of dev.macAddresses) {
        const candidates = macToSerials.get(mac);
        if (candidates && candidates.size === 1) {
          matched = Array.from(candidates)[0] ?? null;
          break;
        }
      }
    }
    // 5. Email + hostname composite.
    if (!matched && email && hn) {
      matched = emailHostToSerial.get(`${email}|${hn}`) ?? null;
    }

    if (matched) {
      pushIntoGroup(groups, matched, dev);
    } else {
      const key = syntheticKey({
        hostname: dev.hostname,
        source: dev.source,
        entityId: dev.entityId,
      });
      pushIntoGroup(groups, key, dev);
    }
  }

  // Hostname-based merge of remaining groups. A1: never merge two real-serial
  // groups. The target is the largest (or, on tie, the real-serial) group.
  mergeByHostname(groups);

  // Serial-in-hostname merge of synthetic groups into real-serial groups,
  // collect-then-apply per A5.
  mergeBySerialInHostname(groups);

  return { groups };
}

function pushIntoGroup(
  groups: Map<string, DeviceObservation[]>,
  key: string,
  dev: DeviceObservation,
): void {
  const existing = groups.get(key);
  if (existing) {
    existing.push(dev);
  } else {
    groups.set(key, [dev]);
  }
}

function addToSetMap(map: Map<string, Set<string>>, key: string, value: string): void {
  let s = map.get(key);
  if (!s) {
    s = new Set<string>();
    map.set(key, s);
  }
  s.add(value);
}

function mergeByHostname(groups: Map<string, DeviceObservation[]>): void {
  const hostnameToKeys = new Map<string, string[]>();
  const keyDeviceCount = new Map<string, number>();
  for (const [key, members] of groups) {
    keyDeviceCount.set(key, members.length);
    const seen = new Set<string>();
    for (const dev of members) {
      const hn = dev.hostnameNormalized;
      if (hn && !seen.has(hn)) {
        seen.add(hn);
        const list = hostnameToKeys.get(hn);
        if (list) list.push(key);
        else hostnameToKeys.set(hn, [key]);
      }
    }
  }
  for (const [, keys] of hostnameToKeys) {
    if (keys.length <= 1) continue;
    const alive = keys.filter((k) => groups.has(k));
    if (alive.length <= 1) continue;
    // A1: bail if two or more groups have real-serial keys.
    const realKeys = alive.filter((k) => !isSyntheticKey(k));
    if (realKeys.length > 1) continue;
    alive.sort((a, b) => {
      const aSyn = isSyntheticKey(a);
      const bSyn = isSyntheticKey(b);
      if (aSyn !== bSyn) return aSyn ? 1 : -1;
      // Larger group wins ties.
      return (keyDeviceCount.get(b) ?? 0) - (keyDeviceCount.get(a) ?? 0);
    });
    const target = alive[0];
    if (!target) continue;
    for (let i = 1; i < alive.length; i += 1) {
      const donor = alive[i];
      if (!donor) continue;
      const donorMembers = groups.get(donor);
      const targetMembers = groups.get(target);
      if (!donorMembers || !targetMembers || donor === target) continue;
      targetMembers.push(...donorMembers);
      groups.delete(donor);
    }
  }
}

function mergeBySerialInHostname(groups: Map<string, DeviceObservation[]>): void {
  const realSerialKeys = Array.from(groups.keys())
    .filter((k) => !isSyntheticKey(k))
    .sort();
  const merges: { target: string; donor: string }[] = [];
  for (const sn of realSerialKeys) {
    if (!groups.has(sn) || sn.length < MIN_SERIAL_LENGTH_FOR_HOSTNAME_MATCH) continue;
    for (const otherKey of Array.from(groups.keys())) {
      if (otherKey === sn) continue;
      if (!groups.has(otherKey)) continue;
      // A1/A4: only collapse synthetic into real.
      if (!isSyntheticKey(otherKey)) continue;
      const members = groups.get(otherKey) ?? [];
      for (const dev of members) {
        if (dev.hostnameNormalized && serialAtBoundary(sn, dev.hostnameNormalized)) {
          merges.push({ target: sn, donor: otherKey });
          break;
        }
      }
    }
  }
  // Apply collected merges in a single pass to prevent cascade (A5).
  for (const { target, donor } of merges) {
    const targetMembers = groups.get(target);
    const donorMembers = groups.get(donor);
    if (!targetMembers || !donorMembers || target === donor) continue;
    targetMembers.push(...donorMembers);
    groups.delete(donor);
  }
}
