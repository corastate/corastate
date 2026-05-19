// Okta mapping piece — pure functions, one per entity kind the source emits.
// The only per-vendor code in the package. Maps Okta user payloads from
// `/api/v1/users` into Corastate's canonical IdentityPartial shape
// (architecture-v3.md §"The canonical schema as contract spine").

import type {
  ConnectorMapping,
  MappingFn,
} from '@corastate/connector-sdk';
import type { IdentityPartial, IdentityStatus } from '@corastate/contracts';

/**
 * Subset of the Okta user payload the mapping uses. The full payload has ~40
 * fields; the mapping deliberately types only what it maps so changes to
 * unused fields don't ripple in.
 *
 * Reference: https://developer.okta.com/docs/reference/api/users/#user-object
 */
export interface OktaUser {
  id: string;
  status: string;
  created: string;
  activated?: string | null;
  lastLogin: string | null;
  lastUpdated: string;
  profile: {
    login: string;
    email: string;
    firstName?: string | null;
    lastName?: string | null;
    title?: string | null;
    department?: string | null;
  };
}

/**
 * Normalize Okta's lifecycle states to the canonical IdentityStatus enum.
 *
 * Okta states: STAGED, PROVISIONED, ACTIVE, RECOVERY, LOCKED_OUT, PASSWORD_EXPIRED,
 * SUSPENDED, DEPROVISIONED. We collapse them into active/suspended/deactivated/unknown
 * to match identitySchema.statusSchema.
 */
export function normalizeOktaStatus(status: string): IdentityStatus {
  switch (status.toUpperCase()) {
    case 'ACTIVE':
    case 'PROVISIONED':
    case 'RECOVERY':
    case 'PASSWORD_EXPIRED':
    case 'LOCKED_OUT':
      return 'active';
    case 'SUSPENDED':
    case 'STAGED':
      return 'suspended';
    case 'DEPROVISIONED':
      return 'deactivated';
    default:
      return 'unknown';
  }
}

function joinName(first: string | null | undefined, last: string | null | undefined): string | null {
  const parts = [first, last].filter((p): p is string => typeof p === 'string' && p.length > 0);
  if (parts.length === 0) return null;
  return parts.join(' ');
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d : null;
}

export const mapOktaUserToIdentity: MappingFn<OktaUser, IdentityPartial> = (raw) => {
  const profile = raw.profile ?? ({} as OktaUser['profile']);
  const partial: IdentityPartial = {
    email: profile.email ? profile.email.toLowerCase() : undefined,
    displayName: joinName(profile.firstName, profile.lastName),
    status: normalizeOktaStatus(raw.status),
    lastLogin: parseDate(raw.lastLogin),
    sources: ['okta'],
    vendorIds: { okta: raw.id },
  };
  return partial;
};

/**
 * Extended mapping that also emits non-canonical Okta-specific attributes
 * (title, department, created) as raw observations. The sync runner writes
 * one observation per defined field on the returned partial, so anything
 * here lands in the observation log even if it's not part of the canonical
 * IdentitySchema.
 *
 * Cast-erased to MappingFn<unknown, IdentityPartial> so the canonical
 * Partial type doesn't have to grow; the extra fields are persisted but
 * never appear on the public Identity response shape.
 */
const mapOktaUserToIdentityWithExtras: MappingFn<OktaUser, IdentityPartial> = (raw) => {
  const base = mapOktaUserToIdentity(raw);
  const profile = raw.profile ?? ({} as OktaUser['profile']);
  const extras: Record<string, unknown> = {
    ...(profile.title ? { title: profile.title } : {}),
    ...(profile.department ? { department: profile.department } : {}),
    ...(raw.created ? { created: parseDate(raw.created) } : {}),
  };
  return { ...base, ...extras } as IdentityPartial;
};

export const oktaMapping: ConnectorMapping = {
  identity: mapOktaUserToIdentityWithExtras as MappingFn<unknown, IdentityPartial>,
};
