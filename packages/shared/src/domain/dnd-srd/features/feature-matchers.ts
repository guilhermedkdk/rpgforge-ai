/**
 * Feature-name matchers + display-name constants + option-card readers (Divine/Primal Order,
 * Blessed Strikes, Elemental Fury) + Magic Initiate source-key builders + default attribute/saving-
 * throw maps. Pure name/`CharacterFormData` logic — the single source both the web editor and the
 * backend derivation use to recognize features. Web `character-state.ts` re-exports these.
 */
import type { AbilityScoreMethod, CharacterFormData } from '../character/character-form-data';
import { DND_ATTRIBUTES } from '../derivation/ability-progression';
import { getFightingStylePick } from './fighting-style';

/** Lowercased, apostrophe- and whitespace-normalized feature name for matching. */
export function normalizeFeatureName(name: string): string {
  return name.trim().toLowerCase().replace(/’/g, "'").replace(/\s+/g, ' ');
}

export function isMagicInitiateFeatureName(name: string): boolean {
  return normalizeFeatureName(name) === 'magic initiate';
}

export function isSkilledFeatureName(name: string): boolean {
  return normalizeFeatureName(name) === 'skilled';
}

/**
 * Whether a skill is granted by a source other than the Skilled feat (class, background, Primal
 * Knowledge, race traits). Used to decide whether to keep a skill proficient after it is removed
 * from / orphaned out of a Skilled selection.
 */
export function isSkillFromNonSkilledSource(data: CharacterFormData, skillKey: string): boolean {
  return (
    (data.classSkillProficiencyKeys ?? []).includes(skillKey) ||
    (data.backgroundSkillKeys ?? []).includes(skillKey) ||
    (data.primalKnowledgeSkillKey ?? null) === skillKey ||
    (data.raceTraitSelections?.['Skillful'] ?? null) === skillKey ||
    (data.raceTraitSelections?.['Keen Senses'] ?? null) === skillKey
  );
}

/** Race traits whose granted spells/cantrips let the player choose Int/Wis/Cha as spellcasting ability. */
export function isRaceLineageSpellcastingFeatureName(name: string): boolean {
  const n = normalizeFeatureName(name);
  if (n === 'elven lineage' || (n.includes('elven') && n.includes('lineage'))) return true;
  if (n === 'gnomish lineage' || (n.includes('gnomish') && n.includes('lineage'))) return true;
  if (n === 'fiendish legacy' || (n.includes('fiendish') && n.includes('legacy'))) return true;
  return false;
}

/** Build a stable source key for a feature-detail–sourced MI gain. */
export function buildMiFdKey(source: string | undefined, name: string, ordinal: number): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `fd:${source ?? 'class'}:${slug}:${ordinal}`;
}
/** Build a stable source key for an ASI-slot–sourced MI gain. */
export function buildMiAsiKey(asiIndex: number): string {
  return `asi:${asiIndex}`;
}
/** Build a stable source key for an Eldritch Invocation (Lessons of the First Ones) MI gain. */
export function buildMiEldritchKey(featId: string): string {
  return `eldritch:${featId}`;
}
/** Stable source key for the Versatile feat MI gain. */
export const MI_VERSATILE_KEY = 'versatile' as const;

export const THIEVES_CANT_DISPLAY_NAME = "Thieves' Cant";

export function isThievesCantFeatureName(name: string): boolean {
  const n = normalizeFeatureName(name);
  return n === "thieves' cant" || n === 'thieves cant';
}

export interface FightingStyleCantripGrant {
  /** Spell list the cantrips come from (e.g. 'Cleric', 'Druid'). */
  spellList: string;
  /** Spellcasting ability for the granted cantrips (e.g. 'Charisma', 'Wisdom'). */
  ability: string;
  /** Display label (e.g. 'Blessed Warrior', 'Druidic Warrior'). */
  label: string;
  /** Number of cantrips granted. */
  max: number;
}

/**
 * The Paladin's "Blessed Warrior" and Ranger's "Druidic Warrior" Fighting Style options grant two
 * cantrips from a fixed class list with a fixed spellcasting ability. Returns that grant when such an
 * option is the active Fighting Style choice, else null. The spell list, ability and label are read
 * from the feature description, so any class with the same pattern works without hardcoding.
 */
export function getFightingStyleCantripGrant(
  data: Pick<CharacterFormData, 'fightingStyleByClass'>,
  /** The instance being read: only the Paladin's and the Ranger's own text carries the option. */
  feature: { desc?: string; sourceClassId?: string } | undefined
): FightingStyleCantripGrant | null {
  const pick = getFightingStylePick(data, feature);
  if (pick.mode !== 'OPTION' || !pick.optionKey) return null;
  const desc = feature?.desc ?? '';
  const listMatch = desc.match(/\btwo\s+([A-Za-z]+)\s+cantrips\b/i);
  const abilityMatch = desc.match(
    /\b(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)\s+is\s+your\s+spellcasting\s+ability\b/i
  );
  if (!listMatch || !abilityMatch) return null;
  const labelMatch = desc.match(/\*\*\s*([A-Za-z][A-Za-z'\s-]*?Warrior)\s*\.?\s*\*\*/i);
  return {
    spellList: listMatch[1],
    ability: abilityMatch[1],
    label: labelMatch?.[1]?.trim() ?? 'Fighting Style',
    max: 2,
  };
}

/** Druid class feature — secret language, shown as a language proficiency on the sheet. */
export const DRUIDIC_DISPLAY_NAME = 'Druidic';

export function isDruidicFeatureName(name: string): boolean {
  return normalizeFeatureName(name) === 'druidic';
}

/** Class feature that grants always-prepared Power Word Heal / Power Word Kill (e.g. Epic Boon). */
export const WORDS_OF_CREATION_DISPLAY_NAME = 'Words of Creation';

export function isWordsOfCreationFeatureName(name: string): boolean {
  return normalizeFeatureName(name) === 'words of creation';
}

/** Paladin (etc.) — grants Find Steed always prepared on the sheet. */
export const FAITHFUL_STEED_DISPLAY_NAME = 'Faithful Steed';

export function isFaithfulSteedFeatureName(name: string): boolean {
  return normalizeFeatureName(name) === 'faithful steed';
}

/** Paladin — grants Divine Smite always prepared (sheet spell row). */
export const PALADINS_SMITE_DISPLAY_NAME = "Paladin's Smite";

export function isPaladinsSmiteFeatureName(name: string): boolean {
  const n = normalizeFeatureName(name);
  return n === "paladin's smite" || n === 'paladins smite';
}

/** Ranger Favored Enemy — grants Hunter's Mark always prepared on the sheet. */
export const FAVORED_ENEMY_DISPLAY_NAME = 'Favored Enemy';

export function isFavoredEnemyFeatureName(name: string): boolean {
  return normalizeFeatureName(name) === 'favored enemy';
}

/** Warlock (etc.) — grants Contact Other Plane always prepared on the sheet. */
export const CONTACT_PATRON_DISPLAY_NAME = 'Contact Patron';

export function isContactPatronFeatureName(name: string): boolean {
  return normalizeFeatureName(name) === 'contact patron';
}

/** Warlock Mystic Arcanum — tooltip source for granted arcanum spells. */
export const MYSTIC_ARCANUM_DISPLAY_NAME = 'Mystic Arcanum';

export function isMysticArcanumFeatureName(name: string): boolean {
  return normalizeFeatureName(name) === 'mystic arcanum';
}

/** Class feature (e.g. Sorcerer) — up to two level-3 spells, always prepared on the sheet. */
export const SIGNATURE_SPELLS_DISPLAY_NAME = 'Signature Spells';

export function isSignatureSpellsFeatureName(name: string): boolean {
  return normalizeFeatureName(name) === 'signature spells';
}

/** Wizard class feature — one level-1 and one level-2 spell, always prepared. */
export const SPELL_MASTERY_DISPLAY_NAME = 'Spell Mastery';

export function isSpellMasteryFeatureName(name: string): boolean {
  return normalizeFeatureName(name) === 'spell mastery';
}

/** Warlock class feature whose options are the Eldritch Invocations. */
export function isEldritchInvocationsFeatureName(name: string): boolean {
  const n = normalizeFeatureName(name);
  return n === 'eldritch invocations' || n === 'eldritch invocation';
}

/**
 * Cleric Divine Order (level 1) — an option-card feature stored in `raceTraitSelections`.
 * Protector grants Martial weapons + Heavy armor; Thaumaturge grants one extra Cleric
 * cantrip and a +WIS (min +1) bonus to Arcana/Religion checks. Option keys come from the
 * label slug (`label.toLowerCase().replace(/['\s]+/g, '-')`).
 */
export const DIVINE_ORDER_DISPLAY_NAME = 'Divine Order';

export function isDivineOrderThaumaturge(data: CharacterFormData): boolean {
  return (data.raceTraitSelections?.[DIVINE_ORDER_DISPLAY_NAME] ?? '') === 'thaumaturge';
}

/**
 * Cleric Blessed Strikes (level 7) — option-card feature stored in `raceTraitSelections`.
 * Potent Spellcasting adds the Wisdom modifier to damage dealt by any Cleric cantrip.
 */
export const BLESSED_STRIKES_DISPLAY_NAME = 'Blessed Strikes';

export function isBlessedStrikesPotentSpellcasting(data: CharacterFormData): boolean {
  return (data.raceTraitSelections?.[BLESSED_STRIKES_DISPLAY_NAME] ?? '') === 'potent-spellcasting';
}

/**
 * Druid Elemental Fury (level 7) — option-card feature stored in `raceTraitSelections`.
 * Potent Spellcasting adds the Wisdom modifier to damage dealt by any Druid cantrip
 * (the Druid analogue of Cleric Blessed Strikes → Potent Spellcasting).
 */
export const ELEMENTAL_FURY_DISPLAY_NAME = 'Elemental Fury';

export function isElementalFuryPotentSpellcasting(data: CharacterFormData): boolean {
  return (data.raceTraitSelections?.[ELEMENTAL_FURY_DISPLAY_NAME] ?? '') === 'potent-spellcasting';
}

/**
 * Druid Improved Elemental Fury (level 18) upgrades the option chosen for Elemental Fury (the
 * selection lives under `Elemental Fury`). With Potent Spellcasting it extends the range of any
 * Druid cantrip with a range of 10+ ft by 300 ft. Requires the upgrade feature to be present.
 */
export function isImprovedElementalFuryPotentSpellcasting(data: CharacterFormData): boolean {
  const hasUpgrade = (data.featureDetails ?? []).some(
    (f) => f.name.trim().toLowerCase() === 'improved elemental fury'
  );
  return hasUpgrade && isElementalFuryPotentSpellcasting(data);
}

/**
 * Druid Primal Order (level 1) — option-card feature stored in `raceTraitSelections`.
 * Warden grants Martial weapons + Medium armor; Magician grants one extra Druid cantrip and a
 * +WIS (min +1) bonus to Arcana/Nature checks (the Druid analogue of Cleric Divine Order).
 */
export const PRIMAL_ORDER_DISPLAY_NAME = 'Primal Order';

export function isPrimalOrderMagician(data: CharacterFormData): boolean {
  return (data.raceTraitSelections?.[PRIMAL_ORDER_DISPLAY_NAME] ?? '') === 'magician';
}

/**
 * Extra cantrips granted by a class-feature option: Cleric Divine Order → Thaumaturge and
 * Druid Primal Order → Magician each grant one extra cantrip from the class list.
 */
export function getOptionGrantedExtraCantrips(data: CharacterFormData): number {
  return (isDivineOrderThaumaturge(data) ? 1 : 0) + (isPrimalOrderMagician(data) ? 1 : 0);
}

/**
 * Skill keys that get a +WIS (min +1) bonus from a class-feature option: Thaumaturge adds it to
 * Arcana/Religion checks, Magician to Arcana/Nature checks.
 */
export function getOptionWisdomCheckBonusSkillKeys(data: CharacterFormData): Set<string> {
  const keys = new Set<string>();
  if (isDivineOrderThaumaturge(data)) {
    keys.add('arcana');
    keys.add('religion');
  }
  if (isPrimalOrderMagician(data)) {
    keys.add('arcana');
    keys.add('nature');
  }
  return keys;
}

/** Barbarian Fast Movement — +10 ft speed while not in Heavy armor. */
export function isFastMovementFeatureName(name: string): boolean {
  return normalizeFeatureName(name) === 'fast movement';
}

/** Ranger Roving — +10 ft speed (and climb/swim) while not in Heavy armor. */
export function isRovingFeatureName(name: string): boolean {
  return normalizeFeatureName(name) === 'roving';
}

/** Monk Unarmored Movement — speed bonus while unarmored. SRD data ships the name with a typo. */
export function isUnarmoredMovementFeatureName(name: string): boolean {
  const n = normalizeFeatureName(name);
  return n === 'unarmored movement' || n === 'unarmoed movement';
}

/**
 * Spell slot level for one Mystic Arcanum gain: from API `detail` (e.g. "level 6 spell") or class level (11→6 … 17→9).
 */
export function resolveMysticArcanumSpellLevel(
  detail: string | undefined,
  gainedAtClassLevel: number | undefined
): number {
  if (detail?.trim()) {
    const m = detail.match(/level\s*(\d+)/i);
    if (m) {
      const n = parseInt(m[1], 10);
      if (Number.isFinite(n)) return Math.max(1, Math.min(9, n));
    }
  }
  if (gainedAtClassLevel != null && Number.isFinite(gainedAtClassLevel)) {
    const map: Record<number, number> = { 11: 6, 13: 7, 15: 8, 17: 9 };
    const hit = map[Math.floor(gainedAtClassLevel)];
    if (hit != null) return hit;
  }
  return 6;
}

/** Bard — leveled spell pickers add Cleric/Druid/Wizard; cantrips stay Bard-only (same pack). */
export function isMagicalSecretsFeatureName(name: string): boolean {
  return normalizeFeatureName(name) === 'magical secrets';
}

/** Bard class feature — recognized for Saving Throw bonus when not proficient in that save. */
export function isJackOfAllTradesFeatureName(name: string): boolean {
  const n = name.trim().toLowerCase().replace(/\s+/g, ' ');
  return n === 'jack of all trades';
}

export function getDefaultAttributes(
  method: AbilityScoreMethod = 'standard-array'
): Record<string, number> {
  const out: Record<string, number> = {};
  const defaultScore = method === 'standard-array' ? 0 : 8;
  for (const a of DND_ATTRIBUTES) {
    out[a] = defaultScore;
  }
  return out;
}

export function getDefaultSavingThrows(): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const a of DND_ATTRIBUTES) {
    out[a] = false;
  }
  return out;
}
