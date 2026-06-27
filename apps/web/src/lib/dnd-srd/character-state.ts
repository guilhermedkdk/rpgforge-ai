/**
 * Character form state for manual creation (D&D 5e–oriented).
 * Used by the manual editor; persisted/sent to API when we add character CRUD.
 */

import {
  ABILITY_SCORE_CAP_FROM_ASI,
  abilityScoreCeilingForAsi,
  calcModifier,
  EPIC_BOON_CAP,
  getEffectiveAttribute,
  getEffectiveModifier,
} from '@rpgforce-ai/shared';
import {
  flattenPersistedSheet,
  isPersistedCharacterSheet,
  PERSISTED_CHARACTER_SCHEMA_VERSION,
} from './character-persistence';
import { coerceNonNegativeWalletInt, WALLET_COIN_MAX } from './equipment-utils';
import type { EldritchInvocationSelection } from './eldritch-invocations';

export {
  ABILITY_SCORE_CAP_FROM_ASI,
  abilityScoreCeilingForAsi,
  calcModifier,
  EPIC_BOON_CAP,
  getEffectiveAttribute,
  getEffectiveModifier,
};

export type AbilityScoreMethod = 'standard-array' | 'point-buy';

export const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8] as const;

export const POINT_BUY_COSTS: Record<number, number> = {
  8: 0,
  9: 1,
  10: 2,
  11: 3,
  12: 4,
  13: 5,
  14: 7,
  15: 9,
};

export const POINT_BUY_BUDGET = 27;
export const POINT_BUY_MIN = 8;
export const POINT_BUY_MAX = 15;

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

/** Rogue class feature — not from the standard language catalog. */
export const MAGIC_INITIATE_SPELL_LISTS = ['Cleric', 'Druid', 'Wizard'] as const;
export type MagicInitiateSpellList = (typeof MAGIC_INITIATE_SPELL_LISTS)[number];

export interface MagicInitiateGain {
  spellList: MagicInitiateSpellList | null;
  cantripNames: (string | null)[];
  spellName: string | null;
  spellcastingAbility: string | null;
}

/** Lowercased, apostrophe- and whitespace-normalized feature name for matching. */
export function normalizeFeatureName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/’/g, "'")
    .replace(/\s+/g, ' ');
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
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
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
  data: Pick<CharacterFormData, 'featureDetails' | 'raceTraitSelections' | 'fightingStyleMode'>,
): FightingStyleCantripGrant | null {
  if ((data.fightingStyleMode ?? 'OPTION') !== 'OPTION') return null;
  const selectedKey = (data.raceTraitSelections?.['Fighting Style'] ?? '').trim();
  if (!selectedKey) return null;
  const feature = (data.featureDetails ?? []).find(
    (f) => f.source === 'class' && f.name.trim().toLowerCase() === 'fighting style',
  );
  const desc = feature?.desc ?? '';
  const listMatch = desc.match(/\btwo\s+([A-Za-z]+)\s+cantrips\b/i);
  const abilityMatch = desc.match(
    /\b(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)\s+is\s+your\s+spellcasting\s+ability\b/i,
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
export const ELDRITCH_INVOCATIONS_DISPLAY_NAME = 'Eldritch Invocations';

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

export function isDivineOrderProtector(data: CharacterFormData): boolean {
  return (data.raceTraitSelections?.[DIVINE_ORDER_DISPLAY_NAME] ?? '') === 'protector';
}

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
export const IMPROVED_ELEMENTAL_FURY_DISPLAY_NAME = 'Improved Elemental Fury';

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

export function isPrimalOrderWarden(data: CharacterFormData): boolean {
  return (data.raceTraitSelections?.[PRIMAL_ORDER_DISPLAY_NAME] ?? '') === 'warden';
}

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

export interface CharacterFormData {
  name: string;
  race: string;
  /** Rule item id for race (from pack) */
  raceRuleItemId: string | null;
  className: string;
  /** Rule item id for class (from pack) */
  classRuleItemId: string | null;
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
  hitDice: string;

  savingThrows: Record<string, boolean>;
  /** Skill key -> proficient (e.g. athletics, acrobatics) */
  skillProficiencies: Record<string, boolean>;
  /** Perícias escolhidas da lista da classe (para popover Skills). */
  classSkillProficiencyKeys: string[];
  /** Opções de perícias da classe (keys + chooseN); preenchido pelo derivado. */
  classSkillOptions: { keys: string[]; chooseN: number | null };
  /** Perícias do antecedente (aparecem selecionadas e não editáveis no popover Skills). */
  backgroundSkillKeys: string[];

  spellsByLevel: Record<
    number,
    Array<{
      name: string;
      /** Auto-granted (any source: race trait, class feature, feat, invocation…); not removable, not counted against the user's cantrip/prepared caps. */
      granted?: boolean;
      /** Where a granted spell came from — shown in the spell row tooltip. */
      grantSource?: string;
    }>
  >;
  /** Per spell level (1–9). Omitted levels / omitted `expended` = not tracked (UI empty when no slots). */
  spellSlots: Record<number, { total?: number; expended?: number }>;

  attacks: AttackEntry[];

  features: string;
  /** Habilidades/traços com descrição para exibir ao clicar (derivado de classe/raça/background). */
  featureDetails: Array<{
    name: string;
    desc: string;
    source?: 'class' | 'race' | 'background';
    /**
     * Stable machine key from ingestion (`normalized.features[].mechanics.featureKey`),
     * e.g. 'magic-initiate', 'elven-lineage'. Preferred over name matching when present;
     * absent for rule items ingested before mechanics existed (name matching still applies).
     */
    featureKey?: string;
    /** Sub-opções selecionáveis (ex.: Elven Lineage, Giant Ancestry). */
    options?: Array<{
      key: string;
      label: string;
      desc?: string;
      cost?: string;
      prerequisite?: string;
    }>;
    /**
     * Dados de tabela(s) por nível (ex.: Weapon Mastery, Rages, Rage Damage).
     * Uma feature pode ter uma ou mais tabelas.
     */
    tableData?: Array<{
      label: string;
      rows: Array<{ level: number; value: string }>;
    }>;
    /** Quantas vezes esta feature foi ganha até o nível atual (ex.: Metamagic = 1 no nível 5, 2 no nível 10). */
    gainCount?: number;
    /**
     * Níveis em que cada ganho ocorreu (ordenados, ≤ nível atual), alinhado a `gainCount` / slots de `abilityScoreImprovementByGain`.
     * Preenchido para ASI quando a classe define `gainedAt` por nível.
     */
    gainedAtLevels?: number[];
    /** Texto por ganho (API `gainedAt[].detail`), alinhado a `gainedAtLevels` — ex. Mystic Arcanum. */
    gainedAtDetails?: string[];
  }>;
  /** Seleção do usuário para traços de raça com sub-opções (ex.: "Elven Lineage" → "high-elf"). */
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
  /** GP gasto em compras via modal (não deduz das linhas de equipamento). */
  equipmentSpentGP: number;
  /**
   * Wallet coins (view mode / sheet-session): integer amounts loaded from and saved to
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
  /**
   * Schema v1 equipment rows: one entry per unique item with quantity.
   * Use `{ id }` from catalog, or `{ name }` if unmappable.
   */
  equipmentPersistedItems?: Array<{ id?: string; name?: string; quantity?: number }>;
  /** Itens comprados: linha → custo total, para devolver GP ao remover. */
  purchasedEquipment: Array<{ line: string; costGP: number }>;
  /** Opções de equipamento inicial da classe (label e options do derivado). */
  startingEquipmentOptions: { label: string; options: { label: string; text: string }[] } | null;
  /** Índice da opção escolhida para a classe (0 = A, 1 = B); null = ainda não escolheu. */
  startingEquipmentSelectedIndex: number | null;
  /** Opções de equipamento do antecedente (label e options do derivado). */
  backgroundEquipmentOptions: { label: string; options: { label: string; text: string }[] } | null;
  /** Índice da opção escolhida para o antecedente; null = ainda não escolheu. */
  backgroundEquipmentSelectedIndex: number | null;
  /** Regra de bônus de atributo do antecedente (preenchido pelo derivado). */
  backgroundAbilityScoreOption: {
    totalPoints: number;
    maxPerAbility: number;
    allowedAbilityNames: string[];
  } | null;
  /** Bônus aplicados por atributo pelo antecedente (ex.: { Strength: 1, Dexterity: 2 }). */
  backgroundAbilityScoreIncrease: Record<string, number>;
  personality: string;
  ideals: string;
  bonds: string;
  flaws: string;

  temporaryHp: number;
  deathSaveSuccesses: number;
  deathSaveFailures: number;

  /** Armas (por id de rule item) às quais o personagem vinculou Maestria em Armas. */
  weaponMasteryWeaponIds?: string[];
  /** Skill key escolhida pela feature Primal Knowledge (se houver). */
  primalKnowledgeSkillKey?: string | null;
  /** Expertise (Rogue etc.): skill keys that receive doubled proficiency. */
  expertiseSkillKeys?: string[];
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
   * One entry per time the class has gained Ability Score Improvement at the current level.
   * For each slot, either increase ability scores (2 points) or one feat — not both.
   */
  abilityScoreImprovementByGain?: AbilityScoreImprovementGainChoice[];
  /** Armadura atualmente considerada equipada em combate (por id de rule item). */
  equippedArmorId?: string | null;
  /** Escudo atualmente considerado equipado em combate (por id de rule item). */
  equippedShieldId?: string | null;
  /** Feat (Epic Boon) escolhido pela habilidade Epic Boon (id de rule item). */
  epicBoonFeatId?: string | null;
  /** Ability score that receives +1 from the selected Epic Boon (e.g. "Strength"). */
  epicBoonAbilityScore?: string | null;
  /** Feat tipo Origin escolhido pela habilidade Versatile (id de rule item). */
  versatileFeatId?: string | null;
  /** Ability score that receives +1 from Grappler feat ("Strength" or "Dexterity"), max 20. */
  grapplerAbilityScore?: string | null;
  /** Fighting Style feat chosen by the Fighting Style feature (id of rule item). */
  fightingStyleFeatId?: string | null;
  /** Mode for Fighting Style: choose a style option from the feature text or choose a feat. */
  fightingStyleMode?: 'OPTION' | 'FEAT';
  /** Cantrips chosen for the Fighting Style "Blessed Warrior" / "Druidic Warrior" option. */
  fightingStyleCantrips?: string[];
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
}

/** Canonical D&D ability names used across sheet state and derivation. */
export const DND_ATTRIBUTES: readonly string[] = [
  'Strength',
  'Dexterity',
  'Constitution',
  'Intelligence',
  'Wisdom',
  'Charisma',
];

function sumByAbilityMap(m: Record<string, number> | undefined): number {
  if (!m) return 0;
  return DND_ATTRIBUTES.reduce((s, a) => s + (m[a] ?? 0), 0);
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

export function createDefaultCharacterData(): CharacterFormData {
  return {
    name: '',
    race: '',
    raceRuleItemId: null,
    className: '',
    classRuleItemId: null,
    level: 1,
    background: '',
    backgroundRuleItemId: null,
    abilityScoreMethod: 'standard-array',
    attributes: getDefaultAttributes('standard-array'),
    currentHp: 0,
    maxHp: 0,
    armorClass: '',
    initiative: '',
    speed: '',
    hitDice: '',
    savingThrows: getDefaultSavingThrows(),
    skillProficiencies: {},
    classSkillProficiencyKeys: [],
    classSkillOptions: { keys: [], chooseN: null },
    backgroundSkillKeys: [],
    spellsByLevel: {},
    spellSlots: {},
    attacks: [{ weapon: '', toHit: '', damage: '' }],
    features: '',
    featureDetails: [],
    raceTraitSelections: {},
    raceLineageSpellcastingAbility: {},
    proficiencies: '',
    toolProficiencyChoices: {},
    holySymbolChoiceItemIds: { class: null, background: null },
    standardLanguageNames: ['Common'],
    equipment: '',
    equipmentSpentGP: 0,
    walletGP: 0,
    walletSP: 0,
    walletCP: 0,
    equipmentGold: 0,
    equipmentPersistedItems: [],
    purchasedEquipment: [],
    startingEquipmentOptions: null,
    startingEquipmentSelectedIndex: null,
    backgroundEquipmentOptions: null,
    backgroundEquipmentSelectedIndex: null,
    backgroundAbilityScoreOption: null,
    backgroundAbilityScoreIncrease: {},
    personality: '',
    ideals: '',
    bonds: '',
    flaws: '',
    temporaryHp: 0,
    deathSaveSuccesses: 0,
    deathSaveFailures: 0,
    weaponMasteryWeaponIds: [],
    primalKnowledgeSkillKey: null,
    expertiseSkillKeys: [],
    scholarExpertiseSkillKey: null,
    deftExplorerExpertiseSkillKey: null,
    deftExplorerLanguageNames: [],
    thievesCantExtraLanguageName: null,
    highElfCantripName: null,
    magicInitiateChoicesByGain: [],
    metamagicOptionKeys: [],
    eldritchInvocationSelections: [],
    pactOfTomeSpellNames: { cantrips: [], rituals: [] },
    mysticArcanumSpellNamesByGain: [],
    signatureSpellsSpellNames: [],
    spellMasterySpellNamesByLevel: {},
    wizardSpellbookByLevel: {},
    wizardSpellbookByScrollByLevel: {},
    abilityScoreImprovementByGain: [],
    equippedArmorId: null,
    equippedShieldId: null,
    epicBoonFeatId: null,
    epicBoonAbilityScore: null,
    versatileFeatId: null,
    grapplerAbilityScore: null,
    fightingStyleFeatId: null,
    fightingStyleMode: 'OPTION',
    fightingStyleCantrips: [],
    skilledProficiencyChoices: [],
    skilledChoicesBySource: {},
  };
}

function mergeCharacterFormDataFromPartial(r: Partial<CharacterFormData>): CharacterFormData {
  const d = createDefaultCharacterData();

  const spellsByLevel: CharacterFormData['spellsByLevel'] = { ...d.spellsByLevel };
  if (r.spellsByLevel && typeof r.spellsByLevel === 'object' && !Array.isArray(r.spellsByLevel)) {
    for (const [k, v] of Object.entries(r.spellsByLevel)) {
      const lv = Number(k);
      if (!Number.isFinite(lv)) continue;
      spellsByLevel[lv] = Array.isArray(v) ? v : [];
    }
  }

  return {
    ...d,
    ...r,
    attributes: { ...d.attributes, ...(r.attributes ?? {}) },
    savingThrows: { ...d.savingThrows, ...(r.savingThrows ?? {}) },
    skillProficiencies: { ...d.skillProficiencies, ...(r.skillProficiencies ?? {}) },
    spellsByLevel,
    spellSlots: { ...d.spellSlots, ...(r.spellSlots ?? {}) },
    attacks:
      Array.isArray(r.attacks) && r.attacks.length > 0 ? r.attacks : d.attacks,
    classSkillProficiencyKeys: Array.isArray(r.classSkillProficiencyKeys)
      ? r.classSkillProficiencyKeys
      : d.classSkillProficiencyKeys,
    classSkillOptions: r.classSkillOptions ?? d.classSkillOptions,
    backgroundSkillKeys: Array.isArray(r.backgroundSkillKeys)
      ? r.backgroundSkillKeys
      : d.backgroundSkillKeys,
    featureDetails: Array.isArray(r.featureDetails) ? r.featureDetails : d.featureDetails,
    raceTraitSelections: { ...d.raceTraitSelections, ...(r.raceTraitSelections ?? {}) },
    raceLineageSpellcastingAbility: {
      ...d.raceLineageSpellcastingAbility,
      ...(r.raceLineageSpellcastingAbility ?? {}),
    },
    toolProficiencyChoices: {
      ...d.toolProficiencyChoices,
      ...(r.toolProficiencyChoices ?? {}),
    },
    standardLanguageNames: Array.isArray(r.standardLanguageNames)
      ? r.standardLanguageNames
      : d.standardLanguageNames,
    purchasedEquipment: Array.isArray(r.purchasedEquipment)
      ? r.purchasedEquipment
      : d.purchasedEquipment,
    equipmentGold: typeof r.equipmentGold === 'number' ? r.equipmentGold : d.equipmentGold,
    equipmentPersistedItems: Array.isArray(r.equipmentPersistedItems)
      ? r.equipmentPersistedItems
      : d.equipmentPersistedItems,
    walletGP:
      'walletGP' in (r as Record<string, unknown>)
        ? Math.min(
            WALLET_COIN_MAX,
            coerceNonNegativeWalletInt((r as Record<string, unknown>).walletGP)
          )
        : d.walletGP,
    walletSP:
      'walletSP' in (r as Record<string, unknown>)
        ? Math.min(
            WALLET_COIN_MAX,
            coerceNonNegativeWalletInt((r as Record<string, unknown>).walletSP)
          )
        : d.walletSP,
    walletCP:
      'walletCP' in (r as Record<string, unknown>)
        ? Math.min(
            WALLET_COIN_MAX,
            coerceNonNegativeWalletInt((r as Record<string, unknown>).walletCP)
          )
        : d.walletCP,
    weaponMasteryWeaponIds: Array.isArray(r.weaponMasteryWeaponIds)
      ? r.weaponMasteryWeaponIds
      : d.weaponMasteryWeaponIds ?? [],
    expertiseSkillKeys: Array.isArray(r.expertiseSkillKeys)
      ? r.expertiseSkillKeys
      : r.expertiseSkillKeys ?? [],
    deftExplorerLanguageNames: Array.isArray(r.deftExplorerLanguageNames)
      ? r.deftExplorerLanguageNames
      : r.deftExplorerLanguageNames ?? [],
    metamagicOptionKeys: Array.isArray(r.metamagicOptionKeys)
      ? r.metamagicOptionKeys
      : r.metamagicOptionKeys ?? [],
    eldritchInvocationSelections: Array.isArray(r.eldritchInvocationSelections)
      ? r.eldritchInvocationSelections
      : (d.eldritchInvocationSelections ?? []),
    pactOfTomeSpellNames:
      r.pactOfTomeSpellNames && typeof r.pactOfTomeSpellNames === 'object'
        ? r.pactOfTomeSpellNames
        : (d.pactOfTomeSpellNames ?? { cantrips: [], rituals: [] }),
    mysticArcanumSpellNamesByGain: Array.isArray(r.mysticArcanumSpellNamesByGain)
      ? r.mysticArcanumSpellNamesByGain
      : r.mysticArcanumSpellNamesByGain ?? [],
    signatureSpellsSpellNames: Array.isArray(r.signatureSpellsSpellNames)
      ? r.signatureSpellsSpellNames
      : r.signatureSpellsSpellNames ?? [],
    spellMasterySpellNamesByLevel: {
      ...d.spellMasterySpellNamesByLevel,
      ...(r.spellMasterySpellNamesByLevel ?? {}),
    },
    wizardSpellbookByLevel: {
      ...d.wizardSpellbookByLevel,
      ...(r.wizardSpellbookByLevel ?? {}),
    },
    wizardSpellbookByScrollByLevel: {
      ...d.wizardSpellbookByScrollByLevel,
      ...(r.wizardSpellbookByScrollByLevel ?? {}),
    },
    backgroundAbilityScoreIncrease: {
      ...d.backgroundAbilityScoreIncrease,
      ...(r.backgroundAbilityScoreIncrease ?? {}),
    },
    abilityScoreImprovementByGain: Array.isArray(r.abilityScoreImprovementByGain)
      ? r.abilityScoreImprovementByGain
      : r.abilityScoreImprovementByGain ?? [],
    skilledProficiencyChoices: Array.isArray(r.skilledProficiencyChoices)
      ? r.skilledProficiencyChoices
      : r.skilledProficiencyChoices ?? [],
    skilledChoicesBySource:
      r.skilledChoicesBySource && typeof r.skilledChoicesBySource === 'object'
        ? r.skilledChoicesBySource
        : (d.skilledChoicesBySource ?? {}),
  };
}

function normalizedJsonSchemaVersion(raw: unknown): number | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const sv = (raw as { schemaVersion?: unknown }).schemaVersion;
  if (sv == null) return null;
  if (typeof sv === 'number' && Number.isFinite(sv)) return Math.trunc(sv);
  if (typeof sv === 'string') {
    const n = Number(sv.trim());
    return Number.isFinite(n) ? Math.trunc(n) : null;
  }
  return null;
}

/**
 * Merge API-persisted JSON with defaults so new form fields do not break existing saves.
 * @param rowSchemaVersion — Prisma column `schemaVersion`, used when the JSON blob omits
 * `schemaVersion`; required for correct flatten + wallet on the view page.
 */
export function mergeCharacterFormDataFromApi(
  raw: unknown,
  rowSchemaVersion?: number
): CharacterFormData {
  const d = createDefaultCharacterData();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return d;
  const jsonSv = normalizedJsonSchemaVersion(raw);
  const rowSv =
    rowSchemaVersion != null && Number.isFinite(rowSchemaVersion)
      ? Math.trunc(rowSchemaVersion)
      : null;
  const effective = jsonSv ?? rowSv;
  const isPersisted =
    isPersistedCharacterSheet(raw) || effective === PERSISTED_CHARACTER_SCHEMA_VERSION;
  if (isPersisted) {
    return mergeCharacterFormDataFromPartial(flattenPersistedSheet(raw));
  }
  return mergeCharacterFormDataFromPartial(raw as Partial<CharacterFormData>);
}


export function formatModifier(score: number): string {
  const mod = calcModifier(score);
  return mod >= 0 ? `+${mod}` : `${mod}`;
}

/** Fields needed to know if ASI score increases are allowed (point buy / standard array / background bonuses). */
export type AbilityScoreImprovementPrerequisites = Pick<
  CharacterFormData,
  | 'abilityScoreMethod'
  | 'attributes'
  | 'background'
  | 'backgroundRuleItemId'
  | 'backgroundAbilityScoreOption'
  | 'backgroundAbilityScoreIncrease'
>;

/** Same rule as the Attributes column: background must be chosen before ASI / background bonus rules apply. */
export function isCharacterBackgroundSelected(
  data: Pick<CharacterFormData, 'background' | 'backgroundRuleItemId'>
): boolean {
  return (data.background ?? '').trim() !== '' || data.backgroundRuleItemId != null;
}

/** All six abilities have values 8–15 and total point-buy cost equals {@link POINT_BUY_BUDGET}. */
export function isPointBuyAbilityDistributionComplete(attributes: Record<string, number>): boolean {
  let spent = 0;
  for (const a of DND_ATTRIBUTES) {
    const s = attributes[a] ?? POINT_BUY_MIN;
    if (s < POINT_BUY_MIN || s > POINT_BUY_MAX) return false;
    spent += POINT_BUY_COSTS[s] ?? 0;
  }
  return spent === POINT_BUY_BUDGET;
}

/** Each ability has one of 15, 14, 13, 12, 10, 8 with no duplicates. */
export function isStandardArrayAbilityDistributionComplete(
  attributes: Record<string, number>
): boolean {
  const values = DND_ATTRIBUTES.map((a) => attributes[a] ?? 0);
  if (values.some((v) => v <= 0)) return false;
  const sorted = [...values].sort((x, y) => x - y);
  const expected = [...STANDARD_ARRAY].sort((x, y) => x - y);
  if (sorted.length !== expected.length) return false;
  return sorted.every((v, i) => v === expected[i]);
}

/**
 * Background ability bonus pool is fully assigned, or the background grants no such pool.
 */
export function isBackgroundAbilityBonusDistributionComplete(
  backgroundAbilityScoreOption: CharacterFormData['backgroundAbilityScoreOption'],
  backgroundAbilityScoreIncrease: Record<string, number> | undefined
): boolean {
  if (!backgroundAbilityScoreOption) return true;
  const allowed =
    backgroundAbilityScoreOption.allowedAbilityNames.length > 0
      ? backgroundAbilityScoreOption.allowedAbilityNames
      : [...DND_ATTRIBUTES];
  const spent = allowed.reduce((s, a) => s + (backgroundAbilityScoreIncrease?.[a] ?? 0), 0);
  return spent === backgroundAbilityScoreOption.totalPoints;
}

/**
 * True when the player may use Ability Score Improvement → Increase Scores (assign ASI points).
 * Requires: full point buy or full standard array, a selected background, and all background ability bonus points spent (if any).
 */
export function canApplyAbilityScoreImprovementASI(
  data: AbilityScoreImprovementPrerequisites
): boolean {
  const method = data.abilityScoreMethod ?? 'standard-array';
  const attrsOk =
    method === 'point-buy'
      ? isPointBuyAbilityDistributionComplete(data.attributes ?? {})
      : isStandardArrayAbilityDistributionComplete(data.attributes ?? {});
  if (!attrsOk) return false;
  if (!isCharacterBackgroundSelected(data)) return false;
  return isBackgroundAbilityBonusDistributionComplete(
    data.backgroundAbilityScoreOption,
    data.backgroundAbilityScoreIncrease
  );
}

/** User-facing prerequisite lines (what the player must do). */
const REQ_BASE_SCORES = 'Finish all six base ability scores (Point Buy or Standard Array).';
const REQ_SELECT_BACKGROUND = 'Select a background.';
const REQ_SPEND_BACKGROUND_BONUSES = 'Spend every point from your background ability bonus pool.';
/** “Feat” = the class feature named Ability Score Improvement (rule item), not the optional feat-vs-+2 picks inside it. */
const REQ_ASI_TEMPLATE = (n: number) =>
  n === 1
    ? 'Complete your Ability Score Improvement feat at this level.'
    : `Complete all ${n} Ability Score Improvement feats at this level.`;
const REQ_EPIC_BOON = 'Choose an Epic Boon feat and the +1 ability.';

/** Human-readable hints when {@link canApplyAbilityScoreImprovementASI} is false (UI tooltips). */
export function getAbilityScoreImprovementASIBlockedReasons(
  data: AbilityScoreImprovementPrerequisites
): string[] {
  const reasons: string[] = [];
  const method = data.abilityScoreMethod ?? 'standard-array';
  if (method === 'point-buy') {
    if (!isPointBuyAbilityDistributionComplete(data.attributes ?? {})) {
      reasons.push(REQ_BASE_SCORES);
    }
  } else if (!isStandardArrayAbilityDistributionComplete(data.attributes ?? {})) {
    reasons.push(REQ_BASE_SCORES);
  }
  if (!isCharacterBackgroundSelected(data)) {
    reasons.push(REQ_SELECT_BACKGROUND);
  } else if (
    !isBackgroundAbilityBonusDistributionComplete(
      data.backgroundAbilityScoreOption,
      data.backgroundAbilityScoreIncrease
    )
  ) {
    reasons.push(REQ_SPEND_BACKGROUND_BONUSES);
  }
  return reasons;
}

/** Data needed to know if all class Ability Score Improvement gains are committed (points or feats). */
export type PrimalBodyAndMindBonusInput = Pick<
  CharacterFormData,
  | 'abilityScoreMethod'
  | 'attributes'
  | 'background'
  | 'backgroundRuleItemId'
  | 'backgroundAbilityScoreOption'
  | 'backgroundAbilityScoreIncrease'
  | 'abilityScoreImprovementByGain'
  | 'featureDetails'
  | 'epicBoonFeatId'
  | 'epicBoonAbilityScore'
  | 'grapplerAbilityScore'
>;

/**
 * Number of Ability Score Improvement entries gained at the current level (from class feature gainCount).
 */
export function getAbilityScoreImprovementGainCount(
  featureDetails: CharacterFormData['featureDetails'] | undefined
): number {
  const asiFeat = (featureDetails ?? []).find(
    (f) => f.source === 'class' && f.name.trim().toLowerCase() === 'ability score improvement'
  );
  return Math.max(0, asiFeat?.gainCount ?? 0);
}

/** Merged ability score bonuses from every “increase scores” gain. */
export function getTotalAbilityScoreImprovementFromGains(
  byGain: AbilityScoreImprovementGainChoice[] | undefined
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const g of byGain ?? []) {
    if (g?.kind === 'increase_scores') {
      for (const a of DND_ATTRIBUTES) {
        const v = g.byAbility[a] ?? 0;
        if (v) out[a] = (out[a] ?? 0) + v;
      }
    }
  }
  return out;
}

/** Feat ids chosen on “choose feat” gains (order matches gain slots). */
export function getAbilityScoreImprovementFeatIdsFromGains(
  byGain: AbilityScoreImprovementGainChoice[] | undefined
): string[] {
  return (byGain ?? [])
    .filter(
      (g): g is { kind: 'feat'; featId: string } =>
        g != null && g.kind === 'feat' && typeof g.featId === 'string' && g.featId.length > 0
    )
    .map((g) => g.featId);
}

export function sumIncreaseScoresInGain(
  choice: AbilityScoreImprovementGainChoice | null | undefined
): number {
  if (!choice || choice.kind !== 'increase_scores') return 0;
  return sumByAbilityMap(choice.byAbility);
}

export function isAbilityScoreImprovementGainComplete(
  choice: AbilityScoreImprovementGainChoice | null | undefined
): boolean {
  if (choice == null) return false;
  if (choice.kind === 'feat') {
    return typeof choice.featId === 'string' && choice.featId.length > 0;
  }
  return sumIncreaseScoresInGain(choice) === 2;
}

/**
 * True when every Ability Score Improvement gain at the current level is resolved (2 points or one feat each).
 */
export function isAbilityScoreImprovementFullyResolved(data: PrimalBodyAndMindBonusInput): boolean {
  const n = getAbilityScoreImprovementGainCount(data.featureDetails);
  if (n <= 0) return true;
  const arr = data.abilityScoreImprovementByGain ?? [];
  if (arr.length < n) return false;
  for (let i = 0; i < n; i++) {
    if (!isAbilityScoreImprovementGainComplete(arr[i])) return false;
  }
  return true;
}

/** Every Mystic Arcanum slot at the current level has a chosen spell name. */
export function isMysticArcanumFullyChosen(data: CharacterFormData): boolean {
  const feat = (data.featureDetails ?? []).find(
    (f) => f.source === 'class' && f.name.trim().toLowerCase() === 'mystic arcanum'
  );
  const n = feat?.gainCount ?? 0;
  if (n <= 0) return true;
  const picks = data.mysticArcanumSpellNamesByGain ?? [];
  for (let i = 0; i < n; i++) {
    if (!String(picks[i] ?? '').trim()) return false;
  }
  return true;
}

const SIGNATURE_SPELLS_REQUIRED_SLOTS = 2;

/** Both Signature Spells slots have a chosen spell when the feature is present. */
export function isSignatureSpellsFullyChosen(data: CharacterFormData): boolean {
  const has = (data.featureDetails ?? []).some(
    (f) => f.source === 'class' && isSignatureSpellsFeatureName(f.name)
  );
  if (!has) return true;
  const picks = data.signatureSpellsSpellNames ?? [];
  for (let i = 0; i < SIGNATURE_SPELLS_REQUIRED_SLOTS; i++) {
    if (!String(picks[i] ?? '').trim()) return false;
  }
  return true;
}

/** Magic Initiate: all active gain slots have spell list, ability, 2 cantrips, and 1 level-1 spell. */
export function isMagicInitiateFullyChosen(data: CharacterFormData): boolean {
  const gains = data.magicInitiateChoicesByGain ?? [];
  for (const g of gains) {
    if (!g?.spellList) return false;
    if (!g.spellcastingAbility) return false;
    if ((g.cantripNames ?? []).filter(Boolean).length < 2) return false;
    if (!g.spellName) return false;
  }
  return true;
}

/** Spell Mastery requires one pick for level 1 and one pick for level 2 when present. */
export function isSpellMasteryFullyChosen(data: CharacterFormData): boolean {
  const has = (data.featureDetails ?? []).some(
    (f) => f.source === 'class' && isSpellMasteryFeatureName(f.name)
  );
  if (!has) return true;
  const picks = data.spellMasterySpellNamesByLevel ?? {};
  return Boolean(String(picks[1] ?? '').trim()) && Boolean(String(picks[2] ?? '').trim());
}

/** Same row of fields as {@link PrimalBodyAndMindBonusInput} (includes Epic Boon picks for +1 resolution). */
export type EpicBoonBonusInput = PrimalBodyAndMindBonusInput;

export function canApplyEpicBoonChoices(data: PrimalBodyAndMindBonusInput): boolean {
  return canApplyAbilityScoreImprovementASI(data) && isAbilityScoreImprovementFullyResolved(data);
}

/** Human-readable hints when {@link canApplyEpicBoonChoices} is false (shared with Primal Champion / Body and Mind). */
export function getEpicBoonPrerequisiteBlockedReasons(data: PrimalBodyAndMindBonusInput): string[] {
  const reasons: string[] = [];
  if (!canApplyAbilityScoreImprovementASI(data)) {
    reasons.push(...getAbilityScoreImprovementASIBlockedReasons(data));
  } else if (!isAbilityScoreImprovementFullyResolved(data)) {
    const n = getAbilityScoreImprovementGainCount(data.featureDetails);
    if (n > 0) {
      reasons.push(REQ_ASI_TEMPLATE(n));
    }
  }
  return reasons;
}

/**
 * Ability that receives the Epic Boon +1 when {@link canApplyEpicBoonChoices} is true and both a boon
 * feat and target ability are chosen. Otherwise modifiers ignore the boon.
 */
export function getEffectiveEpicBoonAbilityScore(data: EpicBoonBonusInput): string | null {
  if (!canApplyEpicBoonChoices(data)) return null;
  const fid = data.epicBoonFeatId;
  if (fid == null || String(fid).trim() === '') return null;
  const s = data.epicBoonAbilityScore;
  return typeof s === 'string' && s.trim() !== '' ? s : null;
}


function featureDetailsHasPrimalChampion(
  featureDetails: CharacterFormData['featureDetails'] | undefined
): boolean {
  return (featureDetails ?? []).some((f) => f.name.trim().toLowerCase() === 'primal champion');
}

function featureDetailsHasBodyAndMind(
  featureDetails: CharacterFormData['featureDetails'] | undefined
): boolean {
  return (featureDetails ?? []).some((f) => f.name.trim().toLowerCase() === 'body and mind');
}

function featureDetailsHasEpicBoon(
  featureDetails: CharacterFormData['featureDetails'] | undefined
): boolean {
  return (featureDetails ?? []).some((f) => f.name.trim().toLowerCase() === 'epic boon');
}

/**
 * When the sheet includes the Epic Boon class feature, Primal Champion / Body and Mind +4 only apply
 * after that feature is fully chosen (boon + ability), same as {@link getEffectiveEpicBoonAbilityScore}.
 */
function isEpicBoonFilledWhenRequiredForPrimalBodyMind(data: EpicBoonBonusInput): boolean {
  if (!featureDetailsHasEpicBoon(data.featureDetails)) return true;
  return getEffectiveEpicBoonAbilityScore(data) != null;
}

/**
 * Whether Primal Champion / Body and Mind **score bonuses** (+4, cap 25) apply.
 * Requires: base array + background bonuses complete, all class ASI gains resolved, the feature on the sheet,
 * and if Epic Boon is on the sheet, it must be fully completed (boon + +1 ability).
 */
export function getPrimalChampionBodyAndMindBonusFlags(data: PrimalBodyAndMindBonusInput): {
  hasPrimalChampion: boolean;
  hasBodyAndMind: boolean;
} {
  const rawPc = featureDetailsHasPrimalChampion(data.featureDetails);
  const rawBm = featureDetailsHasBodyAndMind(data.featureDetails);
  const prereq =
    canApplyEpicBoonChoices(data) && isEpicBoonFilledWhenRequiredForPrimalBodyMind(data);
  return {
    hasPrimalChampion: rawPc && prereq,
    hasBodyAndMind: rawBm && prereq,
  };
}

/**
 * Why Primal Champion / Body and Mind score bonuses (+4, cap 25) are not applied on the sheet yet.
 */
export function getPrimalChampionBodyAndMindBonusBlockedReasons(
  data: PrimalBodyAndMindBonusInput
): string[] {
  const reasons: string[] = [...getEpicBoonPrerequisiteBlockedReasons(data)];
  if (reasons.length > 0) return reasons;
  if (
    featureDetailsHasEpicBoon(data.featureDetails) &&
    getEffectiveEpicBoonAbilityScore(data) == null
  ) {
    reasons.push(REQ_EPIC_BOON);
  }
  return reasons;
}

/**
 * Maximum total ASI bonus points allowed on one ability: ceiling minus effective score
 * from base, background, Primal Champion, Body and Mind, Grappler (everything except ASI).
 * Epic Boon is excluded on purpose: its +1 stacks on top of the ASI cap (it lets the score
 * reach 21), so it must not consume ASI headroom.
 */
export type MaxAsiBonusForAttributeInput = Pick<
  CharacterFormData,
  | 'attributes'
  | 'background'
  | 'backgroundRuleItemId'
  | 'backgroundAbilityScoreIncrease'
  | 'epicBoonAbilityScore'
  | 'epicBoonFeatId'
  | 'featureDetails'
  | 'abilityScoreMethod'
  | 'backgroundAbilityScoreOption'
  | 'abilityScoreImprovementByGain'
  | 'grapplerAbilityScore'
>;

export function maxAsiBonusForAttribute(data: MaxAsiBonusForAttributeInput, attr: string): number {
  const base = data.attributes?.[attr] ?? 0;
  if (base <= 0) return 0;
  const { hasPrimalChampion, hasBodyAndMind } = getPrimalChampionBodyAndMindBonusFlags(data);
  const ceiling = abilityScoreCeilingForAsi(attr, hasPrimalChampion, hasBodyAndMind);
  // Epic Boon (+1) is NOT passed here: it stacks above the ASI cap, so it must not
  // reduce the ASI headroom (otherwise ASI gets clamped and the score can't reach 21).
  const totalExcludingAsiAndBoon = getEffectiveAttribute(
    data.attributes ?? {},
    data.backgroundAbilityScoreIncrease,
    attr,
    null,
    hasPrimalChampion,
    hasBodyAndMind,
    data.grapplerAbilityScore
  );
  return Math.max(0, ceiling - totalExcludingAsiAndBoon);
}

/** Room left on one ability for the “increase scores” choice at `gainIndex`, after other gains. */
export function maxIncreaseScoresOnAttributeForGain(
  data: MaxAsiBonusForAttributeInput,
  attr: string,
  byGain: AbilityScoreImprovementGainChoice[],
  gainIndex: number
): number {
  let fromOthers = 0;
  for (let i = 0; i < byGain.length; i++) {
    if (i === gainIndex) continue;
    const g = byGain[i];
    if (g?.kind === 'increase_scores') fromOthers += g.byAbility[attr] ?? 0;
  }
  return Math.max(0, maxAsiBonusForAttribute(data, attr) - fromOthers);
}

