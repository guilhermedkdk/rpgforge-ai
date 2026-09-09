import { z } from 'zod';

/**
 * Persisted character sheet `data` (schema v1) — the JSON stored in
 * `character_sheets.data`. Mirrors the exact output of the web app's
 * `toPersistedCharacterPayload`. Sections use `.catchall(z.unknown())` so
 * additive fields from newer clients never break older validators.
 */

export const PERSISTED_CHARACTER_SCHEMA_VERSION = 1 as const;

const abilityScoreRecordSchema = z.record(z.string(), z.number());

/** One class the character has levels in. `classes[0]` is the INITIAL class and never reorders. */
const classEntrySchema = z
  .object({
    classRuleItemId: z.string(),
    subclassRuleItemId: z.string().nullable().optional(),
    level: z.number().int().min(1).max(20),
  })
  .catchall(z.unknown());

const identitySchema = z
  .object({
    name: z.string(),
    /** TOTAL character level (sum of `classes[].level`). Drives proficiency bonus and feats. */
    level: z.number().int().min(1),
    raceRuleItemId: z.string().nullable(),
    /** Mirrors `classes[0]`; kept so pre-multiclass readers and the list preview keep working. */
    classRuleItemId: z.string().nullable(),
    /** Optional: sheets saved before subclass support omit it. */
    subclassRuleItemId: z.string().nullable().optional(),
    /** Optional: sheets saved before multiclass support omit it (synthesized from the mirrors). */
    classes: z.array(classEntrySchema).optional(),
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
    /**
     * Which class this spell is prepared through (SRD: "each spell you prepare is associated with
     * one of your classes"). Absent on pre-multiclass sheets, where it resolves to the only class.
     */
    classRuleItemId: z.string().optional(),
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
        .catchall(z.unknown())
    ),
    // Wizard-only; omitted entirely for non-wizards.
    wizardSpellbookByLevel: z.record(z.string(), z.array(z.string())).optional(),
    wizardSpellbookByScrollByLevel: z.record(z.string(), z.array(z.string())).optional(),
    /**
     * Pact Magic slots, a pool separate from `spellSlots`: Warlock levels never feed the
     * Multiclass Spellcaster table. Absent for characters without Pact Magic.
     */
    pactMagicSlots: z
      .object({
        slotLevel: z.number().int().min(1).max(9).optional(),
        total: z.number().int().min(0).optional(),
        expended: z.number().int().min(0).optional(),
      })
      .catchall(z.unknown())
      .optional(),
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

/**
 * Where an item came from. RECORDED when the starting-equipment bundle is applied, never inferred
 * later: attributing by text fails on a resolved placeholder ("Musical Instrument, Lute" vs the
 * bundle's "Musical Instrument of your choice"), on an item present in both bundles, and on the
 * pack's OCR typos. Absent on sheets saved before this field existed, which fall back to the text
 * matching that produced them.
 */
const equipmentSourceSchema = z.enum(['class', 'background', 'manual']);

const equipmentItemSchema = z
  .object({
    id: z.string().optional(),
    name: z.string().optional(),
    quantity: z.number().int().min(1),
    source: equipmentSourceSchema.optional(),
  })
  .catchall(z.unknown())
  .refine((item) => Boolean(item.id?.trim()) || Boolean(item.name?.trim()), {
    message: 'equipment item must have an id or a name',
  });

const equipmentSchema = z
  .object({
    wallet: walletSchema,
    items: z.array(equipmentItemSchema),
    /**
     * Starting gold per source. `wallet.gold` stays the total (what play mode spends); this says how
     * much of it each bundle contributed, so the creation view can show it inside that bundle instead
     * of as an unattributable lump.
     */
    goldBySource: z
      .object({
        class: z.number().int().min(0).optional(),
        background: z.number().int().min(0).optional(),
      })
      .optional(),
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
