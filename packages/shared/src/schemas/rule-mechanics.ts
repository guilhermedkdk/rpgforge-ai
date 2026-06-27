import { z } from 'zod';

/**
 * Machine-readable mechanics written by the ingestion pipeline into
 * `normalized.mechanics` (rule item level) and into each entry of
 * `normalized.features[].mechanics` / `normalized.traits[].mechanics`.
 *
 * The frontend matches features by `featureKey`/`markers` instead of display
 * names, falling back to name matching for rows ingested before this existed.
 */

const featureSelectionKindSchema = z.enum([
  'spell',
  'skill',
  'feat',
  'option',
  'ability',
  'language',
  'tool',
  'item',
]);

const featureChoiceDescriptorSchema = z
  .object({
    featureKey: z.string(),
    selectionKind: featureSelectionKindSchema,
    /** Picks allowed per gain of the feature (defaults to 1). */
    choicesPerGain: z.number().int().min(1).optional(),
    options: z
      .union([
        z.object({
          source: z.literal('inline'),
          options: z.array(z.object({ key: z.string(), name: z.string() })),
        }),
        z.object({
          source: z.literal('query'),
          /** Partial RuleItemListParams forwarded to /rule-items. */
          params: z.record(z.string(), z.unknown()),
        }),
      ])
      .optional(),
  })
  .catchall(z.unknown());

const mechanicsTableRoleSchema = z.enum(['resource', 'slots', 'cantrips', 'prepared']);

export const ruleMechanicsSchema = z
  .object({
    /** Stable machine key for the feature/feat (e.g. 'magic-initiate', 'pact-magic'). */
    featureKey: z.string().optional(),
    /** Behavior flags (e.g. 'spellbook-caster' on the Wizard class item). */
    markers: z.array(z.string()).optional(),
    choices: z.array(featureChoiceDescriptorSchema).optional(),
    /** Roles for the class tables this feature consumes (matched by table name). */
    tables: z
      .array(z.object({ name: z.string(), role: mechanicsTableRoleSchema }))
      .optional(),
  })
  .catchall(z.unknown());

export type RuleMechanics = z.infer<typeof ruleMechanicsSchema>;

/** Marker attached at the CLASS rule item level for spellbook-based casters (Wizard). */
export const CLASS_MARKER_SPELLBOOK_CASTER = 'spellbook-caster';
