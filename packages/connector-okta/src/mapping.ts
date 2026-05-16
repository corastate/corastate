// Okta mapping piece — pure functions, one per entity kind the source emits.
// The only per-vendor code in the package. Real implementations land in Week 2
// (Phase 1 sprint plan v3, §"Week 2"); the structural commit ships signatures
// + thrown-stubs so the skeleton type-checks.

import type {
  ConnectorMapping,
  MappingFn,
} from '@corastate/connector-sdk';
import type { IdentityPartial } from '@corastate/contracts';

/**
 * Subset of the Okta user payload the mapping uses. The full payload has ~40
 * fields; the mapping deliberately types only what it maps.
 */
export interface OktaUser {
  id: string;
  status: string;
  lastLogin: string | null;
  lastUpdated: string;
  profile: {
    email: string;
    login: string;
    firstName?: string;
    lastName?: string;
  };
}

export const mapOktaUserToIdentity: MappingFn<OktaUser, IdentityPartial> = (_raw) => {
  // TODO(week-2): populate from raw. Shape sketch:
  //   {
  //     email: raw.profile.email.toLowerCase(),
  //     displayName: [raw.profile.firstName, raw.profile.lastName].filter(Boolean).join(' '),
  //     status: normalizeStatus(raw.status),  // see identitySchema.statusSchema
  //     lastLogin: raw.lastLogin ? new Date(raw.lastLogin) : null,
  //     sources: ['okta'],
  //     vendorIds: { okta: raw.id },
  //   }
  throw new Error('mapOktaUserToIdentity: not implemented (Week 2)');
};

export const oktaMapping: ConnectorMapping = {
  identity: mapOktaUserToIdentity as MappingFn<unknown, IdentityPartial>,
};
