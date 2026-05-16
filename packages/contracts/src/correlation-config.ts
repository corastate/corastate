// Shape of configs/correlation.json. The correlation engine reads a value
// of this shape; the loader validates against this schema at boot and fails
// loudly if the file is malformed (architecture-v3, §"Correlation rules").

import { z } from 'zod';

export const normalizationSchema = z
  .enum(['none', 'lowercase', 'trim', 'lowercase+trim'])
  .describe('Normalization applied to the field value before two records are compared.');

export const matchKeySchema = z
  .object({
    field: z
      .string()
      .describe(
        'Canonical field name to match on. Must be a field in deviceSchema or identitySchema.',
      ),
    composite: z
      .array(z.string())
      .optional()
      .describe(
        'Composite match: all listed fields must agree. e.g. ["hostname","macAddresses"].',
      ),
    normalize: normalizationSchema.default('none'),
  })
  .describe('One entry in the ordered match-priority list. First key with a hit wins.');

export const sourcePrioritySchema = z
  .record(z.array(z.string()))
  .describe(
    'Per canonical field name, an ordered list of source ids. When two sources disagree, the first source in the list wins. Fields not listed fall back to the most-recent observation.',
  );

export const complianceRuleSchema = z
  .object({
    name: z.string().describe('Human-readable rule name surfaced in the UI.'),
    description: z.string().optional(),
    when: z
      .unknown()
      .describe(
        'Predicate over a resolved canonical record. Shape is rule-DSL — TBD in Phase 1 Week 3 once the engine lands. Stays unknown here so the engine owns the language.',
      ),
  })
  .describe('A single classification rule. The engine evaluates every rule per device.');

export const correlationConfigSchema = z
  .object({
    matchPriority: z
      .array(matchKeySchema)
      .describe(
        'Ordered list. First match wins. The prototype ships: serial, then azureAdDeviceId, then hostname, then macAddresses.',
      ),
    sourcePriority: sourcePrioritySchema,
    compliance: z
      .array(complianceRuleSchema)
      .describe('Compliance classification rules, evaluated in order; first match wins.'),
  })
  .describe('Top-level shape of configs/correlation.json.');

export type CorrelationConfig = z.infer<typeof correlationConfigSchema>;
export type MatchKey = z.infer<typeof matchKeySchema>;
export type ComplianceRule = z.infer<typeof complianceRuleSchema>;
