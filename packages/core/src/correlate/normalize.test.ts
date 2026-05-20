import { describe, expect, it } from 'vitest';

import {
  applyNormalization,
  isSyntheticKey,
  normalizeHostname,
  normalizeMac,
  normalizeSerial,
  serialAtBoundary,
  syntheticKey,
} from './normalize.js';

describe('normalizeMac', () => {
  it('canonicalizes colon, hyphen, and dot delimiters', () => {
    expect(normalizeMac('aa:bb:cc:dd:ee:ff')).toBe('AA:BB:CC:DD:EE:FF');
    expect(normalizeMac('aa-bb-cc-dd-ee-ff')).toBe('AA:BB:CC:DD:EE:FF');
    expect(normalizeMac('aabb.ccdd.eeff')).toBe('AA:BB:CC:DD:EE:FF');
    expect(normalizeMac('AABBCCDDEEFF')).toBe('AA:BB:CC:DD:EE:FF');
  });

  it('returns null for malformed input', () => {
    expect(normalizeMac('not-a-mac')).toBeNull();
    expect(normalizeMac('aa:bb:cc:dd:ee')).toBeNull();
    expect(normalizeMac('')).toBeNull();
    expect(normalizeMac(null)).toBeNull();
    expect(normalizeMac(undefined)).toBeNull();
  });
});

describe('normalizeHostname', () => {
  it('strips Windows DOMAIN\\HOST prefix and keeps the host part', () => {
    expect(normalizeHostname('CORP\\wl-laptop-01')).toBe('WL-LAPTOP-01');
  });

  it('drops FQDN suffix for non-numeric hostnames', () => {
    expect(normalizeHostname('host.corp.example.com')).toBe('HOST');
  });

  it('preserves IP-looking hosts intact', () => {
    expect(normalizeHostname('10.0.0.1')).toBe('10.0.0.1');
  });

  it('collapses underscore + whitespace + repeated hyphens to single hyphens', () => {
    expect(normalizeHostname('  wesley_s laptop  ')).toBe('WESLEY-S-LAPTOP');
  });

  it('strips smart quotes and ASCII apostrophes', () => {
    expect(normalizeHostname("wesley's mac")).toBe('WESLEYS-MAC');
    expect(normalizeHostname('wesley’s mac')).toBe('WESLEYS-MAC');
  });

  it('returns empty string for null/undefined', () => {
    expect(normalizeHostname(null)).toBe('');
    expect(normalizeHostname(undefined)).toBe('');
    expect(normalizeHostname('')).toBe('');
  });
});

describe('normalizeSerial', () => {
  it('uppercases and trims', () => {
    expect(normalizeSerial('  c02xy12345ab  ')).toBe('C02XY12345AB');
  });

  it('returns null for empty input', () => {
    expect(normalizeSerial('')).toBeNull();
    expect(normalizeSerial('   ')).toBeNull();
    expect(normalizeSerial(null)).toBeNull();
    expect(normalizeSerial(undefined)).toBeNull();
  });
});

describe('serialAtBoundary', () => {
  it('matches at start, end, or between hyphens', () => {
    expect(serialAtBoundary('C02XY12345AB', 'C02XY12345AB')).toBe(true);
    expect(serialAtBoundary('C02XY12345AB', 'HOST-C02XY12345AB')).toBe(true);
    expect(serialAtBoundary('C02XY12345AB', 'C02XY12345AB-PROD')).toBe(true);
    expect(serialAtBoundary('C02XY12345AB', 'PREFIX-C02XY12345AB-SUFFIX')).toBe(true);
  });

  it('rejects substring matches without boundary', () => {
    expect(serialAtBoundary('C02XY12345AB', 'XC02XY12345ABX')).toBe(false);
    expect(serialAtBoundary('C02XY12345AB', 'C02XY12345ABEXTRA')).toBe(false);
  });

  it('handles empty inputs without throwing', () => {
    expect(serialAtBoundary('', 'HOSTNAME')).toBe(false);
    expect(serialAtBoundary('SERIAL', '')).toBe(false);
  });
});

describe('isSyntheticKey', () => {
  it('classifies HOSTNAME-/IP-/UNKNOWN- as synthetic', () => {
    expect(isSyntheticKey('HOSTNAME-WL-LAPTOP')).toBe(true);
    expect(isSyntheticKey('IP-10.0.0.1')).toBe(true);
    expect(isSyntheticKey('UNKNOWN-okta-abc')).toBe(true);
  });

  it('classifies a real serial as not synthetic', () => {
    expect(isSyntheticKey('C02XY12345AB')).toBe(false);
  });
});

describe('syntheticKey', () => {
  it('prefers normalized hostname', () => {
    expect(syntheticKey({ hostname: 'host.example.com', source: 'okta', entityId: 'abc' }))
      .toBe('HOSTNAME-HOST');
  });

  it('falls back to UNKNOWN-source-entity when hostname is missing', () => {
    expect(syntheticKey({ hostname: null, source: 'okta', entityId: 'abc' }))
      .toBe('UNKNOWN-okta-abc');
  });
});

describe('applyNormalization', () => {
  it('respects the four configured modes', () => {
    expect(applyNormalization('  Foo  ', 'none')).toBe('  Foo  ');
    expect(applyNormalization('  Foo  ', 'lowercase')).toBe('  foo  ');
    expect(applyNormalization('  Foo  ', 'trim')).toBe('Foo');
    expect(applyNormalization('  Foo  ', 'lowercase+trim')).toBe('foo');
  });

  it('passes null through unchanged', () => {
    expect(applyNormalization(null, 'lowercase+trim')).toBeNull();
  });
});
