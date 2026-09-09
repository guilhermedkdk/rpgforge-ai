/**
 * The numbers a character sheet DISPLAYS: ability rows, saving throws, skills, speed and the
 * passive scores. One source for the on-screen sheet and the PDF export, so a printed sheet can
 * never disagree with the sheet it was printed from.
 *
 * Everything here reads the pack and the shared rules math; nothing re-derives a rule.
 */
import type { RuleItemResponse } from '../../../types/ruleitem';
import type { CharacterFormData, FeatureDetail } from '../character/character-form-data';
import { calcModifier } from '../math/ability';
import { getEffectiveAttribute } from '../math/attributes';
import { proficiencyBonusForLevel } from '../math/proficiency-bonus';
import {
  DND_ATTRIBUTES,
  getEffectiveEpicBoonAbilityScore,
  getPrimalChampionBodyAndMindBonusFlags,
  getTotalAbilityScoreImprovementFromGains,
} from './ability-progression';
import { computeEffectiveArmorClass } from './effective-armor-class';
import { getOptionWisdomCheckBonusSkillKeys } from '../features/feature-matchers';
import {
  isFastMovementFeature,
  isJackOfAllTradesFeature,
  isRovingFeature,
  isUnarmoredMovementFeature,
} from '../features/feature-mechanics';
import { getEffectiveExpertiseSkillKeys, getSkillsFromAbilities } from '../proficiencies/skills';

/** Ability key as the pack writes it ("str") to the attribute name the sheet stores ("Strength"). */
export const ABILITY_KEY_TO_ATTRIBUTE: Record<string, string> = {
  str: 'Strength',
  dex: 'Dexterity',
  con: 'Constitution',
  int: 'Intelligence',
  wis: 'Wisdom',
  cha: 'Charisma',
};

const AURA_OF_PROTECTION = 'aura of protection';
const WOOD_ELF_SPEED_BONUS = 5;
const FAST_MOVEMENT_BONUS = 10;
const ROVING_BONUS = 10;

/** Background increase + every ASI gain, merged per ability. */
export function getCombinedAbilityBonuses(data: CharacterFormData): Record<string, number> {
  const background = data.backgroundAbilityScoreIncrease ?? {};
  const improvements = getTotalAbilityScoreImprovementFromGains(data.abilityScoreImprovementByGain);
  const out: Record<string, number> = {};
  for (const ability of new Set([...Object.keys(background), ...Object.keys(improvements)])) {
    out[ability] = (background[ability] ?? 0) + (improvements[ability] ?? 0);
  }
  return out;
}

function getSelectedElvenLineage(data: CharacterFormData): string | null {
  const trait = (data.featureDetails ?? []).find(
    (f) => f.source === 'race' && f.name.trim().toLowerCase() === 'elven lineage'
  );
  return trait ? (data.raceTraitSelections?.[trait.name] ?? null) : null;
}

/**
 * Feature rows as the sheet shows them: two Elven Lineage options restate a number inside another
 * trait's text (Drow darkvision 120 ft, Wood Elf speed 35 ft) instead of getting a row of their own.
 */
export function getDisplayFeatureDetails(data: CharacterFormData): FeatureDetail[] {
  const featureDetails = data.featureDetails ?? [];
  const lineage = getSelectedElvenLineage(data);
  if (lineage !== 'drow' && lineage !== 'wood-elf') return featureDetails;

  return featureDetails.map((feature) => {
    if (feature.source !== 'race') return feature;
    const name = feature.name.trim().toLowerCase();
    if (lineage === 'drow' && name === 'darkvision') {
      return { ...feature, desc: feature.desc.replace(/\b60\b/g, '120') };
    }
    if (lineage === 'wood-elf' && name === 'speed') {
      return { ...feature, desc: feature.desc.replace(/\b30\b/g, '35') };
    }
    return feature;
  });
}

/** Ability scores and modifiers of a character, with every feature bonus already applied. */
export interface AbilityResolver {
  scoreOf: (attribute: string) => number;
  modifierOf: (attribute: string) => number;
}

/** The one place the display math resolves an ability: same inputs the editor's context passes. */
export function getAbilityResolver(data: CharacterFormData): AbilityResolver {
  const combinedAbilityBonuses = getCombinedAbilityBonuses(data);
  const epicBoonAbilityScore = getEffectiveEpicBoonAbilityScore(data);
  const { hasPrimalChampion, hasBodyAndMind } = getPrimalChampionBodyAndMindBonusFlags(data);

  const scoreOf = (attribute: string): number =>
    getEffectiveAttribute(
      data.attributes ?? {},
      combinedAbilityBonuses,
      attribute,
      epicBoonAbilityScore,
      hasPrimalChampion,
      hasBodyAndMind,
      data.grapplerAbilityScore
    );

  return {
    scoreOf,
    modifierOf: (attribute: string) => {
      const score = scoreOf(attribute);
      return score === 0 ? 0 : calcModifier(score);
    },
  };
}

function isHeavyArmor(item: RuleItemResponse | null): boolean {
  if (!item) return false;
  const normalized = (item.normalized ?? {}) as Record<string, unknown>;
  const armor = normalized.armor as { category?: string | null } | null | undefined;
  return String(armor?.category ?? '')
    .toLowerCase()
    .includes('heavy');
}

// Monk Unarmored Movement: the bonus from its own per-level table, unarmored only.
function unarmoredMovementBonus(data: CharacterFormData, featureDetails: FeatureDetail[]): number {
  const feature = featureDetails.find(isUnarmoredMovementFeature);
  if (!feature) return 0;
  if (data.equippedArmorId || data.equippedShieldId) return 0;

  const level = Math.max(1, Math.min(20, data.level ?? 1));
  const tables = feature.tableData ?? [];
  if (tables.length === 0) return 0;

  const table =
    tables.find((t) => t.label.trim().toLowerCase().includes('unarmored movement')) ?? tables[0];
  const row = (table?.rows ?? [])
    .filter((r) => r.level <= level)
    .sort((a, b) => b.level - a.level)[0];
  const match = String(row?.value ?? '').match(/-?\d+/);
  return match ? Math.max(0, parseInt(match[0], 10)) : 0;
}

export interface DisplaySpeedParams {
  data: CharacterFormData;
  featureDetails: FeatureDetail[];
  /** Armor catalog; only the equipped id is looked up, to tell whether it is heavy. */
  armors: RuleItemResponse[];
}

/** Walking speed with the movement features applied (Wood Elf, Fast Movement, Roving, Unarmored Movement). */
export function computeDisplaySpeed({ data, featureDetails, armors }: DisplaySpeedParams): number {
  const base = Number(data.speed) || 0;
  const equippedArmor = data.equippedArmorId
    ? (armors.find((a) => a.id === data.equippedArmorId) ?? null)
    : null;
  const heavy = isHeavyArmor(equippedArmor);

  const woodElf = getSelectedElvenLineage(data) === 'wood-elf' ? WOOD_ELF_SPEED_BONUS : 0;
  const fastMovement =
    featureDetails.some(isFastMovementFeature) && !heavy ? FAST_MOVEMENT_BONUS : 0;
  const roving = featureDetails.some(isRovingFeature) && !heavy ? ROVING_BONUS : 0;

  return base + woodElf + fastMovement + roving + unarmoredMovementBonus(data, featureDetails);
}

/** Paladin Aura of Protection: every save gains the Charisma modifier (minimum +1). */
export function getAuraOfProtectionBonus(
  featureDetails: FeatureDetail[],
  charismaScore: number
): number {
  const hasAura = featureDetails.some((f) => f.name.trim().toLowerCase() === AURA_OF_PROTECTION);
  if (!hasAura) return 0;
  return Math.max(1, calcModifier(charismaScore));
}

export interface AbilityRow {
  attribute: string;
  score: number;
  modifier: number;
}

export interface SavingThrowRow {
  attribute: string;
  proficient: boolean;
  modifier: number;
}

export interface SkillRow {
  key: string;
  name: string;
  /** Short ability key from the pack ("dex"), which is how the sheet labels the row. */
  abilityKey: string;
  attribute: string;
  proficient: boolean;
  expertise: boolean;
  modifier: number;
}

export interface DisplayRowParams {
  data: CharacterFormData;
  /** Feature rows as displayed (see `getDisplayFeatureDetails`). */
  featureDetails: FeatureDetail[];
  /** Absent below level 1: the sheet leaves the field empty instead of showing +2. */
  proficiencyBonus: number | null | undefined;
  /** Reuses the editor's resolver when it has one; built from `data` otherwise. */
  abilities?: AbilityResolver;
}

/** The six saving-throw rows: ability modifier + proficiency, Jack of All Trades, Aura of Protection. */
export function computeSavingThrowRows({
  data,
  featureDetails,
  proficiencyBonus,
  abilities,
}: DisplayRowParams): SavingThrowRow[] {
  const { scoreOf, modifierOf } = abilities ?? getAbilityResolver(data);
  const pb = proficiencyBonus ?? 0;
  const hasJackOfAllTrades = featureDetails.some(
    (f) => f.source === 'class' && isJackOfAllTradesFeature(f)
  );
  const auraBonus = getAuraOfProtectionBonus(featureDetails, scoreOf('Charisma'));

  return DND_ATTRIBUTES.map((attribute) => {
    const proficient = Boolean(data.savingThrows?.[attribute]);
    const jackOfAllTrades =
      hasJackOfAllTrades && !proficient && proficiencyBonus != null ? Math.floor(pb / 2) : 0;
    return {
      attribute,
      proficient,
      modifier: modifierOf(attribute) + (proficient ? pb : 0) + jackOfAllTrades + auraBonus,
    };
  });
}

export interface SkillRowParams extends Omit<DisplayRowParams, 'featureDetails'> {
  /** Skill catalog from the pack (see `getSkillsFromAbilities`). */
  skillsList: Array<{ key: string; name: string; abilityKey: string }>;
}

/** One row per pack skill: ability modifier + proficiency (doubled by Expertise) + option bonuses. */
export function computeSkillRows({
  data,
  proficiencyBonus,
  abilities,
  skillsList,
}: SkillRowParams): SkillRow[] {
  const { scoreOf, modifierOf } = abilities ?? getAbilityResolver(data);
  const pb = proficiencyBonus ?? 0;

  // Cleric Thaumaturge (Arcana/Religion) and Druid Magician (Arcana/Nature) add +WIS (min +1).
  const wisCheckBonusKeys = getOptionWisdomCheckBonusSkillKeys(data);
  const wisCheckBonus = Math.max(1, calcModifier(scoreOf('Wisdom')));
  const expertiseKeys = getEffectiveExpertiseSkillKeys(data);

  return skillsList.map((skill) => {
    const attribute = ABILITY_KEY_TO_ATTRIBUTE[skill.abilityKey] ?? 'Strength';
    const proficient = data.skillProficiencies?.[skill.key] ?? false;
    const expertise = expertiseKeys.includes(skill.key);
    return {
      key: skill.key,
      name: skill.name,
      abilityKey: skill.abilityKey,
      attribute,
      proficient,
      expertise,
      modifier:
        modifierOf(attribute) +
        (proficient ? pb * (expertise ? 2 : 1) : 0) +
        (wisCheckBonusKeys.has(skill.key) ? wisCheckBonus : 0),
    };
  });
}

export interface SheetDisplayStatsInput {
  data: CharacterFormData;
  /** ABILITY rule items: the skill catalog comes from the pack, never from a hardcoded list. */
  abilities: RuleItemResponse[];
  feats: RuleItemResponse[];
  armors: RuleItemResponse[];
}

export interface SheetDisplayStats {
  proficiencyBonus: number | null;
  abilityRows: AbilityRow[];
  savingThrowRows: SavingThrowRow[];
  skillRows: SkillRow[];
  armorClass: number;
  speed: number;
  passivePerception: number;
  featureDetails: FeatureDetail[];
}

/** Every displayed number of a sheet, in one pass. */
export function computeSheetDisplayStats({
  data,
  abilities,
  feats,
  armors,
}: SheetDisplayStatsInput): SheetDisplayStats {
  const featureDetails = getDisplayFeatureDetails(data);
  const resolver = getAbilityResolver(data);
  const proficiencyBonus = (data.level ?? 0) < 1 ? null : proficiencyBonusForLevel(data.level);
  const rowParams = { data, featureDetails, proficiencyBonus, abilities: resolver };

  const skillRows = computeSkillRows({
    ...rowParams,
    skillsList: getSkillsFromAbilities(abilities),
  });
  const perception = skillRows.find((row) => row.key === 'perception');

  return {
    proficiencyBonus,
    abilityRows: DND_ATTRIBUTES.map((attribute) => ({
      attribute,
      score: resolver.scoreOf(attribute),
      modifier: resolver.modifierOf(attribute),
    })),
    savingThrowRows: computeSavingThrowRows(rowParams),
    skillRows,
    armorClass: computeEffectiveArmorClass({ data, featureDetails, feats, armors }),
    speed: computeDisplaySpeed({ data, featureDetails, armors }),
    passivePerception: 10 + (perception?.modifier ?? 0),
    featureDetails,
  };
}
