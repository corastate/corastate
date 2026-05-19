/**
 * Mapping tests against fixture payloads modelled on real Okta API responses.
 * The mapping is the only per-vendor code in the package, so these tests
 * carry the weight of "the Okta integration is shaped right".
 */

import { describe, expect, it } from 'vitest';
import {
  mapOktaUserToIdentity,
  normalizeOktaStatus,
  type OktaUser,
} from './mapping.js';

const baseUser: OktaUser = {
  id: '00u1abcdEF',
  status: 'ACTIVE',
  created: '2024-01-04T10:00:00.000Z',
  lastLogin: '2026-05-18T11:30:00.000Z',
  lastUpdated: '2026-05-18T11:30:01.000Z',
  profile: {
    login: 'jane.doe@example.com',
    email: 'Jane.Doe@example.com',
    firstName: 'Jane',
    lastName: 'Doe',
    title: 'Staff Engineer',
    department: 'Platform',
  },
};

describe('mapOktaUserToIdentity', () => {
  it('lowercases the email', () => {
    const out = mapOktaUserToIdentity(baseUser);
    expect(out.email).toBe('jane.doe@example.com');
  });

  it('joins first + last into displayName', () => {
    expect(mapOktaUserToIdentity(baseUser).displayName).toBe('Jane Doe');
  });

  it('uses the source-record id only via vendorIds', () => {
    const out = mapOktaUserToIdentity(baseUser);
    expect(out.vendorIds).toEqual({ okta: '00u1abcdEF' });
    expect(out.sources).toEqual(['okta']);
  });

  it('parses lastLogin to a Date', () => {
    const out = mapOktaUserToIdentity(baseUser);
    expect(out.lastLogin).toBeInstanceOf(Date);
    expect(out.lastLogin!.toISOString()).toBe('2026-05-18T11:30:00.000Z');
  });

  it('returns null displayName when both names are missing', () => {
    const u: OktaUser = {
      ...baseUser,
      profile: { login: 'a@b', email: 'a@b' },
    };
    expect(mapOktaUserToIdentity(u).displayName).toBeNull();
  });

  it('handles a never-logged-in user', () => {
    const u: OktaUser = { ...baseUser, lastLogin: null };
    expect(mapOktaUserToIdentity(u).lastLogin).toBeNull();
  });
});

describe('normalizeOktaStatus', () => {
  it('maps ACTIVE/PROVISIONED/RECOVERY/PASSWORD_EXPIRED/LOCKED_OUT to active', () => {
    for (const s of ['ACTIVE', 'PROVISIONED', 'RECOVERY', 'PASSWORD_EXPIRED', 'LOCKED_OUT']) {
      expect(normalizeOktaStatus(s)).toBe('active');
    }
  });

  it('maps SUSPENDED/STAGED to suspended', () => {
    expect(normalizeOktaStatus('SUSPENDED')).toBe('suspended');
    expect(normalizeOktaStatus('STAGED')).toBe('suspended');
  });

  it('maps DEPROVISIONED to deactivated', () => {
    expect(normalizeOktaStatus('DEPROVISIONED')).toBe('deactivated');
  });

  it('falls back to unknown for novel states', () => {
    expect(normalizeOktaStatus('NOVEL_STATE')).toBe('unknown');
  });
});
