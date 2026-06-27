import { z } from 'zod';

/**
 * Persisted character sheet `data` (schema v1) — the JSON stored in
 * `character_sheets.data`. Mirrors the exact output of the web app's
 * `toPersistedCharacterPayload`. Sections use `.catchall(z.unknown())` so
 * additive fields from newer clients never break older validators.
 */

export const PERSISTED_CHARACTER_SCHEMA_VERSION = 1 as const;

const abilityScoreRecordSchema = z.record(z.string(), z.number());

const identitySchema = z
  .object({
    name: z.string(),
    level: z.number().int().min(1),
    raceRuleItemId: z.string().nullable(),
    classRuleItemId: z.string().nullable(),
    backgroundRuleItemId: z.string().nullable(),
    abilityScoreMethod: z.enum(['standard-array', 'point-buy']),
    attributes: abilityScoreRecordSchema,
    backgroundAbilityScoreIncrease: abilityScoreRecordSchema,
  })
  .catchall(z.unknown());

const personalitySchema = z
  .object({
    personality: z.string(),
    ideals: z.string(),
    bonds: z.string(),
    flaws: z.string(),
  })
  .catchall(z.unknown());

const combatSchema = z
  .object({
    currentHp: z.number(),
    maxHp: z.number(),
    armorClass: z.string(),
    initiative: z.string(),
    speed: z.string(),
    temporaryHp: z.number(),
    deathSaveSuccesses: z.number().int().min(0),
    deathSaveFailures: z.number().int().min(0),
    equippedArmorId: z.string().nullable(),
    equippedShieldId: z.string().nullable(),
  })
  .catchall(z.unknown());

const sheetSpellRowSchema = z
  .object({
    name: z.string(),
    /** True when the spell was auto-granted (not picked by the user in the spell modals). */
    granted: z.boolean().optional(),
    /** Where a granted spell came from (shown in the spell row tooltip). */
    grantSource: z.string().optional(),
  })
  .catchall(z.unknown());

const spellcastingSchema = z
  .object({
    // spellcastingAbility / spellSaveDC / spellAttackBonus are intentionally NOT persisted:
    // they are deterministic, derived at render time from the spellcasting ability + proficiency.
    spellsByLevel: z.record(z.string(), z.array(sheetSpellRowSchema)),
    /** Per-level expended spell-slot tracking (gameplay state); absent until slots are spent. */
    spellSlots: z.record(
      z.string(),
      z
        .object({
          total: z.number().optional(),
          expended: z.number().optional(),
        })
        .catchall(z.unknown()),
    ),
    // Wizard-only; omitted entirely for non-wizards.
    wizardSpellbookByLevel: z.record(z.string(), z.array(z.string())).optional(),
    wizardSpellbookByScrollByLevel: z.record(z.string(), z.array(z.string())).optional(),
  })
  .catchall(z.unknown());

/**
 * A proficiency that maps to a `rule_item` (tools, languages): `ruleItemId` is the canonical link
 * (null when the SRD has no matching item) and `name` is denormalized so viewers render without a
 * lookup.
 */
const proficiencyRefSchema = z
  .object({
    ruleItemId: z.string().nullable(),
    name: z.string(),
  })
  .catchall(z.unknown());

/**
 * Fully resolved proficiency snapshot — the complete set the character is proficient with, computed
 * from rule items at save time (the editor still re-derives armor/weapons on load). `savingThrows`
 * and `skills` are canonical keys (ability names / skill keys); `armor` and `weapons` are category
 * keys (no rule item exists for "simple weapons"); `tools` and `languages` carry rule-item ids.
 */
const proficienciesSchema = z
  .object({
    savingThrows: z.array(z.string()),
    skills: z.array(z.string()),
    armor: z.array(z.string()),
    weapons: z.array(z.string()),
    tools: z.array(proficiencyRefSchema),
    languages: z.array(proficiencyRefSchema),
  })
  .catchall(z.unknown());

const walletSchema = z
  .object({
    gold: z.number().int().min(0),
    silver: z.number().int().min(0),
    copper: z.number().int().min(0),
  })
  .catchall(z.unknown());

const equipmentItemSchema = z
  .object({
    id: z.string().optional(),
    name: z.string().optional(),
    quantity: z.number().int().min(1),
  })
  .catchall(z.unknown())
  .refine((item) => Boolean(item.id?.trim()) || Boolean(item.name?.trim()), {
    message: 'equipment item must have an id or a name',
  });

const equipmentSchema = z
  .object({
    wallet: walletSchema,
    items: z.array(equipmentItemSchema),
    startingEquipmentSelectedIndex: z.number().int().optional(),
    backgroundEquipmentSelectedIndex: z.number().int().optional(),
  })
  .catchall(z.unknown());

/**
 * Per-feature selections grouped by feature display name (e.g. "Fiendish Legacy" →
 * `{ option, spellcastingAbility }`; "Epic Boon" → `{ featId, abilityScore }`). Each feature's
 * choice object is heterogeneous, so values are validated loosely — the web form state is the typed
 * source of truth, mapped to/from this shape in `lib/dnd-srd/feature-choices.ts`.
 */
const featureChoicesSchema = z.record(z.string(), z.object({}).catchall(z.unknown()));

export const persistedCharacterDataSchema = z
  .object({
    schemaVersion: z.literal(PERSISTED_CHARACTER_SCHEMA_VERSION),
    identity: identitySchema,
    personality: personalitySchema,
    combat: combatSchema,
    spellcasting: spellcastingSchema,
    proficiencies: proficienciesSchema,
    equipment: equipmentSchema,
    featureChoices: featureChoicesSchema,
  })
  .catchall(z.unknown());

export type PersistedCharacterData = z.infer<typeof persistedCharacterDataSchema>;
