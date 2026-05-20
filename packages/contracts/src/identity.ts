// Canonical identity record. Mirrors device.ts in shape.

import { z } from 'zod';

export const identityStatusSchema = z
  .enum(['active', 'suspended', 'deactivated', 'unknown'])
  .describe('Identity lifecycle state, normalized across sources.');

export type IdentityStatus = z.infer<typeof identityStatusSchema>;

export const identitySchema = z.object({
  id: z.string().uuid().describe('Corastate-internal entity id.'),
  email: z
    .string()
    .email()
    .describe('Primary email, lower-cased. Primary match key for identities.'),
  displayName: z.string().nullable().describe('Display name as the source reported.'),
  status: identityStatusSchema,
  lastLogin: z
    .coerce.date()
    .nullable()
    .describe('Last successful login the source saw.'),
  sources: z.array(z.string()).describe('Source ids that have observed this identity.'),
  vendorIds: z
    .record(z.string())
    .describe(
      'Per-source vendor user id, e.g. {"okta":"00u1234","defender":"..."}. Useful for cross-linking.',
    ),
});

export type Identity = z.infer<typeof identitySchema>;

export const identityPartialSchema = identitySchema.partial();
export type IdentityPartial = z.infer<typeof identityPartialSchema>;

/**
 * List-row shape for /v1/identities. Extends the canonical Identity with
 * a derived `deviceCount` — how many correlated devices the identity owns.
 * Kept separate from the canonical record so non-list call sites don't
 * carry a field the source observations never emit.
 */
export const identityListItemSchema = identitySchema.extend({
  deviceCount: z
    .number()
    .int()
    .nonnegative()
    .describe(
      'Derived: count of canonical_devices whose owner_email matches this identity.',
    ),
});

export type IdentityListItem = z.infer<typeof identityListItemSchema>;
