/**
 * Editor/session form-state shape for a D&D SRD character (a superset of the persisted schema:
 * it also carries transient creation-time UI state). Pure types only — no runtime/React deps — so
 * the deterministic rules math can live in this package and the backend can recompute against the
 * same shape the web editor uses. The web `lib/dnd-srd/character-state.ts` re-exports these to keep
 * its existing import surface stable.
 */

export type AbilityScoreMethod = 'standard-array' | 'point-buy';

export interface AttackEntry {
  weapon: string;
  toHit: string;
  damage: string;
}

/**
 * Resolution for one Ability Score Improvement gain: either 2 points among abilities or one feat.
 */
export type AbilityScoreImprovementGainChoice =
  | null
  | { kind: 'increase_scores'; byAbility: Record<string, number> }
  | { kind: 'feat'; featId: string };

export const MAGIC_INITIATE_SPELL_LISTS = ['Cleric', 'Druid', 'Wizard'] as const;
export type MagicInitiateSpellList = (typeof MAGIC_INITIATE_SPELL_LISTS)[number];

export interface MagicInitiateGain {
  spellList: MagicInitiateSpellList | null;
  cantripNames: (string | null)[];
  spellName: string | null;
  spellcastingAbility: string | null;
}

export interface EldritchInvocationSelection {
  /** Option key from the feature's parsed options. */
  key: string;
  /** Chosen cantrip name for invocations that require one (Agonizing Blast, Eldritch Spear, Repelling Blast). */
  spellName?: string | null;
  /** Chosen feat id for invocations that grant a feat (Lessons of the First Ones → Origin feat). */
  featId?: string | null;
}

/**
 * One class the character has levels in. `classes[0]` is the INITIAL class: under SRD 5.2 it is the
 * only one granting saving throws, the full starting proficiencies, starting equipment and the
 * level 1 maximum-die hit points. Its position is therefore load-bearing and never reorders.
 */
export interface ClassEntry {
  classRuleItemId: string;
  className: string;
  subclassRuleItemId: string | null;
  subclass: string;
  /** Level in THIS class (1-20), not the character level. */
  level: number;
}

/** One hit die type and how many levels contribute it, e.g. `{ dieMax: 10, levels: 3 }`. */
export interface HitDicePoolEntry {
  dieMax: number;
  levels: number;
}

/** Which starting-equipment bundle an item came from; 'manual' is anything bought or added later. */
export type EquipmentSource = 'class' | 'background' | 'manual';

export interface CharacterFormData {
  name: string;
  race: string;
  /** Rule item id for race (from pack) */
  raceRuleItemId: string | null;
  /**
   * Every class the character has levels in. The scalar `className` / `classRuleItemId` /
   * `subclass` / `subclassRuleItemId` / `level` / `hitDice` fields below are DERIVED mirrors of
   * this array, rewritten by `syncClassMirrors` on the single write path so they cannot drift.
   */
  classes: ClassEntry[];
  /** Mirror of `classes[0].className`. */
  className: string;
  /** Mirror of `classes[0].classRuleItemId`. */
  classRuleItemId: string | null;
  /** Mirror of `classes[0].subclass`. */
  subclass: string;
  /** Mirror of `classes[0].subclassRuleItemId`; chosen from that class's level 3 on. */
  subclassRuleItemId: string | null;
  /** TOTAL character level: mirror of the sum of `classes[].level`. */
  level: number;
  background: string;
  /** Rule item id for background (from pack) */
  backgroundRuleItemId: string | null;

  abilityScoreMethod: AbilityScoreMethod;
  attributes: Record<string, number>;

  currentHp: number;
  maxHp: number;
  armorClass: string;
  initiative: string;
  speed: string;
  /** Display form of the hit dice pool, e.g. `1d10` or `3d10 + 5d6`. Derived from `hitDicePool`. */
  hitDice: string;
  /** Hit dice per class, aligned with `classes` (index 0 = initial class). Drives the HP math. */
  hitDicePool: HitDicePoolEntry[];

  savingThrows: Record<string, boolean>;
  /** Skill key -> proficient (e.g. athletics, acrobatics) */
  skillProficiencies: Record<string, boolean>;
  /** Skills chosen from the class list (for the Skills popover). Union across every class. */
  classSkillProficiencyKeys: string[];
  /** Class skill options (keys + chooseN); filled by the derivation. Merged across every class. */
  classSkillOptions: { keys: string[]; chooseN: number | null };
  /**
   * Per-class skill picks and menus, keyed by `classRuleItemId`. Multiclassing grants a REDUCED
   * skill choice (Bard 1 any, Ranger/Rogue 1 from their own list), so the budgets cannot be pooled.
   * The flat fields above stay as the union the Skills popover renders.
   */
  classSkillProficiencyKeysByClass: Record<string, string[]>;
  classSkillOptionsByClass: Record<string, { keys: string[]; chooseN: number | null }>;
  /** Background skills (shown selected and non-editable in the Skills popover). */
  backgroundSkillKeys: string[];

  spellsByLevel: Record<
    number,
    Array<{
      name: string;
      /** Auto-granted (any source: race trait, class feature, feat, invocation…); not removable, not counted against the user's cantrip/prepared caps. */
      granted?: boolean;
      /** Where a granted spell came from — shown in the spell row tooltip. */
      grantSource?: string;
      /**
       * Class this spell is prepared through. Per the SRD each prepared spell belongs to one class
       * and uses that class's spellcasting ability. Absent on single-class sheets.
       */
      classRuleItemId?: string;
    }>
  >;
  /** Per spell level (1–9). Omitted levels / omitted `expended` = not tracked (UI empty when no slots). */
  spellSlots: Record<number, { total?: number; expended?: number }>;
  /** Pact Magic pool, kept apart from `spellSlots`: Warlock levels never feed the multiclass table. */
  pactMagicSlots?: { slotLevel?: number; total?: number; expended?: number };

  attacks: AttackEntry[];

  features: string;
  /** Features/traits with a description to show on click (derived from class/subclass/race/background). */
  featureDetails: Array<{
    name: string;
    desc: string;
    source?: 'class' | 'subclass' | 'race' | 'background';
    /**
     * Which class (or the class owning the subclass) granted this feature. Without it two classes
     * sharing a feature name (Fighting Style, Weapon Mastery, Expertise, Ability Score Improvement)
     * collapse into one. Absent for race/background rows and on pre-multiclass data.
     */
    sourceClassId?: string;
    sourceClassName?: string;
    /** Level in the granting class, which is what `gainedAtLevels` was filtered against. */
    sourceClassLevel?: number;
    /**
     * Stable machine key from ingestion (`normalized.features[].mechanics.featureKey`),
     * e.g. 'magic-initiate', 'elven-lineage'. Preferred over name matching when present;
     * absent for rule items ingested before mechanics existed (name matching still applies).
     */
    featureKey?: string;
    /** Selectable sub-options (e.g. Elven Lineage, Giant Ancestry). */
    options?: Array<{
      key: string;
      label: string;
      desc?: string;
      cost?: string;
      prerequisite?: string;
    }>;
    /**
     * Per-level table data (e.g. Weapon Mastery, Rages, Rage Damage).
     * A feature may have one or more tables.
     */
    tableData?: Array<{
      label: string;
      rows: Array<{ level: number; value: string }>;
    }>;
    /** How many times this feature was gained up to the current level (e.g. Metamagic = 1 at level 5, 2 at level 10). */
    gainCount?: number;
    /**
     * Where THIS instance's gains start inside the character-wide by-gain array (the sum of the
     * `gainCount` of the same-named class features derived before it). 0 on a single-class sheet.
     *
     * `abilityScoreImprovementByGain` is one flat array for the whole character, so without the
     * offset every class writes from index 0 and a Fighter 4 / Wizard 4 / Cleric 4 shares ONE choice
     * between its three Ability Score Improvements.
     */
    gainSlotOffset?: number;
    /**
     * Levels at which each gain occurred (sorted, ≤ current level), aligned with `gainCount` / `abilityScoreImprovementByGain` slots.
     * Filled for ASI when the class defines `gainedAt` per level.
     */
    gainedAtLevels?: number[];
    /** Per-gain text (API `gainedAt[].detail`), aligned with `gainedAtLevels`, e.g. Mystic Arcanum. */
    gainedAtDetails?: string[];
  }>;
  /** User selection for race traits with sub-options (e.g. "Elven Lineage" → "high-elf"). */
  raceTraitSelections: Record<string, string>;
  /**
   * Spellcasting ability (Intelligence/Wisdom/Charisma) chosen for spells/cantrips granted by
   * race lineage traits, keyed by feature name (e.g. "Elven Lineage", "Gnomish Lineage", "Fiendish Legacy").
   */
  raceLineageSpellcastingAbility: Record<string, string>;
  proficiencies: string;
  /** Tool proficiency "Choose N ..." lines: value string (e.g. "Choose 3 Musical Instruments") -> chosen item names. */
  toolProficiencyChoices: Record<string, string[]>;
  /**
   * Tool proficiencies loaded from a persisted sheet's flat `proficiencies.tools` snapshot, awaiting
   * redistribution into the derived "Choose…" slots (`toolProficiencyChoices`). Transient: consumed
   * and cleared on load by `seedToolProficiencyChoicesFromPersisted`; never re-persisted.
   */
  persistedToolProficiencies?: Array<{ ruleItemId: string | null; name: string }>;
  /**
   * Chosen Holy Symbol rule-item id per starting-equipment placeholder scope. A holy symbol is
   * equipment (a spellcasting focus), not a tool proficiency — this is creation-time UI state and
   * is NOT persisted; at save the pick is resolved into the equipment items list (single source).
   */
  holySymbolChoiceItemIds: { class: string | null; background: string | null };
  /**
   * Standard languages from catalog (tag language:rarity:standard): always includes Common when available,
   * plus up to two more (see MAX_STANDARD_LANGUAGES_TOTAL).
   */
  standardLanguageNames: string[];
  equipment: string;
  /** GP spent on purchases via the modal (does not deduct from the equipment lines). */
  equipmentSpentGP: number;
  /**
   * Wallet coins (play mode, on a saved sheet): integer amounts loaded from and saved to
   * `equipment.wallet` in the persisted JSON. Separate from the creation-mode GP line pool.
   */
  walletGP: number;
  walletSP: number;
  walletCP: number;
  /**
   * Simplified persistence helpers (schema v1): total gold amount represented by `equipment` GP lines.
   * When set, editor can rebuild `equipment` string from `equipmentPersistedItems`.
   */
  equipmentGold?: number;
  /** Starting gold per bundle, so the rebuilt text can put each amount back in its own block. */
  equipmentGoldBySource?: { class?: number; background?: number };
  /**
   * Schema v1 equipment rows: one entry per unique item with quantity.
   * Use `{ id }` from catalog, or `{ name }` if unmappable.
   */
  equipmentPersistedItems?: Array<{
    id?: string;
    name?: string;
    quantity?: number;
    source?: EquipmentSource;
  }>;
  /**
   * Source of each line of `equipment`, by index, when it is KNOWN (rebuilt from persisted items or
   * written by the AI wizard). Authoritative: `splitEquipmentBySource` uses it instead of matching
   * text. Absent on a hand-built sheet, where the text still matches the bundle exactly.
   */
  equipmentSourceByLine?: EquipmentSource[];
  /** Purchased items: line → total cost, to refund GP on removal. */
  purchasedEquipment: Array<{ line: string; costGP: number }>;
  /** Class starting-equipment options (label and options from the derivation). */
  startingEquipmentOptions: { label: string; options: { label: string; text: string }[] } | null;
  /** Index of the option chosen for the class (0 = A, 1 = B); null = not chosen yet. */
  startingEquipmentSelectedIndex: number | null;
  /** Background equipment options (label and options from the derivation). */
  backgroundEquipmentOptions: { label: string; options: { label: string; text: string }[] } | null;
  /** Index of the option chosen for the background; null = not chosen yet. */
  backgroundEquipmentSelectedIndex: number | null;
  /** Background ability-score bonus rule (filled by the derivation). */
  backgroundAbilityScoreOption: {
    totalPoints: number;
    maxPerAbility: number;
    allowedAbilityNames: string[];
  } | null;
  /** Bonuses applied per ability by the background (e.g. { Strength: 1, Dexterity: 2 }). */
  backgroundAbilityScoreIncrease: Record<string, number>;
  personality: string;
  ideals: string;
  bonds: string;
  flaws: string;

  temporaryHp: number;
  deathSaveSuccesses: number;
  deathSaveFailures: number;

  /**
   * Weapons (by rule item id) bound to Weapon Mastery, PER granting class.
   *
   * Barbarian, Fighter, Paladin, Ranger and Rogue each grant their own count off their own table, so
   * a multiclass character has one budget per class and picking in one panel must not touch another.
   * Key = the class's rule item id (`''` only on sheets saved before the split; the derivation
   * rebinds it). Read it through `getWeaponMasteryPicks` / `getAllWeaponMasteryWeaponIds`.
   */
  weaponMasteryWeaponIdsByClass?: Record<string, string[]>;
  /** Skill key chosen by the Primal Knowledge feature (if any). */
  primalKnowledgeSkillKey?: string | null;
  /**
   * Expertise picks PER granting class (Bard, Rogue and Ranger each grant 2 per gain on their own
   * schedules), keyed by the class's rule item id. Read/write through the `expertise.ts` helpers;
   * Scholar and Deft Explorer keep their own single-skill fields below.
   */
  expertiseSkillKeysByClass?: Record<string, string[]>;
  /** Scholar (Wizard): one proficient skill from the feature list that gains Expertise. */
  scholarExpertiseSkillKey?: string | null;
  /** Deft Explorer: one proficient skill that gains Expertise (stacked in sheet with class Expertise). */
  deftExplorerExpertiseSkillKey?: string | null;
  /** Deft Explorer: up to two extra standard languages (same catalog as standard language picker). */
  deftExplorerLanguageNames?: string[];
  /** Thieves' Cant: one extra standard language (catalog); Thieves' Cant itself is granted automatically. */
  thievesCantExtraLanguageName?: string | null;
  /** High Elf (Elven Lineage): user-chosen Wizard cantrip to replace the default granted by the lineage. */
  highElfCantripName?: string | null;
  /** Magic Initiate feat: chosen spell list + 2 cantrips + 1 level-1 spell per gain. */
  magicInitiateChoicesByGain?: (MagicInitiateGain | null)[];
  /**
   * Source-keyed MI choices — stable across class/background changes.
   * Keys: 'fd:{source}:{slug}:{ordinal}' | 'versatile' | 'asi:{index}'.
   * Orphaned keys (source removed) are ignored. `magicInitiateChoicesByGain` is
   * always recomputed from this as the ordered view of active choices.
   */
  magicInitiateChoicesBySource?: Record<string, MagicInitiateGain | null>;
  /** Metamagic options selected by the player (2 picks per Metamagic gain). */
  metamagicOptionKeys?: string[];
  /**
   * Eldritch Invocations chosen. One entry per selected instance (repeatable invocations may
   * appear more than once); `spellName`/`featId` hold the sub-choice when one is required.
   */
  eldritchInvocationSelections?: EldritchInvocationSelection[];
  /**
   * Pact of the Tome — Book of Shadows: 3 chosen cantrips + 2 level-1 ritual spells (any class).
   * They function as always-prepared Warlock spells while the invocation is active.
   */
  pactOfTomeSpellNames?: { cantrips: string[]; rituals: string[] };
  /**
   * Mystic Arcanum: chosen Warlock spell display name per gain (same order as feature `gainedAtLevels`).
   */
  mysticArcanumSpellNamesByGain?: (string | null)[];
  /**
   * Signature Spells: two class spell list picks at spell level 3, always prepared.
   * Indices 0 and 1; null/empty = not chosen yet.
   */
  signatureSpellsSpellNames?: (string | null)[];
  /**
   * Spell Mastery: chosen always-prepared spell names keyed by level (1 and 2).
   * Missing/empty value = not chosen for that level.
   */
  spellMasterySpellNamesByLevel?: Record<number, string | null | undefined>;
  /**
   * Wizard spellbook selections (leveled spells only, grouped by spell level 1-9).
   * Used to restrict Wizard prepared-spell picks when a Spellbook item is present in equipment.
   */
  wizardSpellbookByLevel?: Record<number, string[]>;
  /**
   * Wizard spellbook spells learned by consuming scrolls (does not consume level progression capacity).
   */
  wizardSpellbookByScrollByLevel?: Record<number, string[]>;
  /**
   * Evocation Savant (Evoker): Evocation spells gained free from the subclass, by spell level.
   * Like scroll spells, they enter the spellbook without consuming the normal capacity.
   */
  evocationSavantSpellbookByLevel?: Record<number, string[]>;
  /**
   * One entry per time the class has gained Ability Score Improvement at the current level.
   * For each slot, either increase ability scores (2 points) or one feat — not both.
   */
  abilityScoreImprovementByGain?: AbilityScoreImprovementGainChoice[];
  /** Armor currently considered equipped in combat (by rule item id). */
  equippedArmorId?: string | null;
  /** Shield currently considered equipped in combat (by rule item id). */
  equippedShieldId?: string | null;
  /** Feat (Epic Boon) chosen by the Epic Boon feature (rule item id). */
  epicBoonFeatId?: string | null;
  /** Ability score that receives +1 from the selected Epic Boon (e.g. "Strength"). */
  epicBoonAbilityScore?: string | null;
  /** Origin-type feat chosen by the Versatile feature (rule item id). */
  versatileFeatId?: string | null;
  /** Ability score that receives +1 from Grappler feat ("Strength" or "Dexterity"), max 20. */
  grapplerAbilityScore?: string | null;
  /**
   * Fighting Style PER granting class (Fighter, Paladin and Ranger each grant their own), keyed by
   * the class's rule item id. Read/write only through the `fighting-style.ts` helpers; `''` appears
   * only on sheets saved before the split and the derivation rebinds it.
   */
  fightingStyleByClass?: Record<
    string,
    { featId: string | null; mode: 'OPTION' | 'FEAT'; optionKey: string | null; cantrips: string[] }
  >;
  /**
   * Flattened, deduped Skilled picks across all sources (skill/tool ids, e.g. "skill:acrobatics").
   * Derived from `skilledChoicesBySource`; consumed by derivation/persistence/validation.
   */
  skilledProficiencyChoices?: string[];
  /**
   * Skilled feat picks per granting source (Background / each ASI / Lessons of the First Ones …),
   * keyed by the same stable source keys as `computeActiveSkilledSources`. Each source holds up to
   * 3 picks. Source of truth; orphaned keys are pruned by the derivation when a source is removed.
   */
  skilledChoicesBySource?: Record<string, string[]>;
  /** Bonus Proficiencies (College of Lore): 3 chosen skills that gain proficiency. */
  bonusProficienciesSkillKeys?: string[];
  /** Additional Fighting Style (Champion): second Fighting Style feat (rule item id). */
  additionalFightingStyleFeatId?: string | null;
  /**
   * Magical Discoveries (College of Lore): 2 spells from the Cleric/Druid/Wizard lists,
   * always prepared. Indices 0 and 1; null/empty = not chosen.
   */
  magicalDiscoveriesSpellNames?: (string | null)[];
}

/** One derived feature/trait row (source, options, tables) — the element shape of `featureDetails`. */
export type FeatureDetail = NonNullable<CharacterFormData['featureDetails']>[number];
