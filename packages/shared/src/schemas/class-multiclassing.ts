import { z } from 'zod';

/**
 * The SRD 5.2 "As a Multiclass Character" block, written by the ingestion into
 * `normalized.multiclassing` on every CLASS rule item.
 *
 * Open5e ships neither piece: `primaryAbilities` comes back empty for all 12
 * classes, and the multiclass proficiency subset was never ingested at all.
 * See `apps/api/scripts/open5e-data-issues.md`.
 */

/** Ability score every multiclass prerequisite is measured against. */
export const MULTICLASS_PREREQUISITE_SCORE = 13;

const primaryAbilitiesSchema = z.object({
  // 'any' = 13 in ONE of them (Fighter is "Strength or Dexterity"); 'all' = 13 in each.
  mode: z.enum(['any', 'all']),
  abilities: z.array(z.string()).min(1),
});

// Phrased exactly like the class's own "Core X Traits" rows so the derivation reuses one parser.
const multiclassGrantsSchema = z.object({
  weaponProficiencies: z.string().optional(),
  armorTraining: z.string().optional(),
  toolProficiencies: z.string().optional(),
  // 'class-list' resolves against the class's own skill list, so it can never drift from the pack.
  skillChoice: z
    .object({ count: z.number().int().min(1), from: z.enum(['any', 'class-list']) })
    .optional(),
});

export const classMulticlassingSchema = z.object({
  primaryAbilities: primaryAbilitiesSchema,
  grants: multiclassGrantsSchema,
});

export type ClassMulticlassing = z.infer<typeof classMulticlassingSchema>;
export type MulticlassPrimaryAbilities = z.infer<typeof primaryAbilitiesSchema>;
export type MulticlassGrants = z.infer<typeof multiclassGrantsSchema>;

/** Reads and validates `normalized.multiclassing`; null when absent or malformed. */
export function readClassMulticlassing(normalized: unknown): ClassMulticlassing | null {
  if (!normalized || typeof normalized !== 'object') return null;
  const raw = (normalized as Record<string, unknown>).multiclassing;
  if (!raw) return null;
  const parsed = classMulticlassingSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}
