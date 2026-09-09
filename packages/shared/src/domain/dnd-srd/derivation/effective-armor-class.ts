/**
 * Effective AC: the number actually shown on a sheet, assembled from equipped armor, shield
 * proficiency and the AC-altering features. `recomputeCombatStats` only persists the *unarmored
 * base* (10 + Dex) into `combat.armorClass`, so anything that needs the real AC (the sheet header,
 * the sheets list) has to run this — reading the persisted field alone loses armor and every
 * feature bonus.
 */
import type { RuleItemResponse } from '../../../types/ruleitem';
import type { CharacterFormData, FeatureDetail } from '../character/character-form-data';
import { assembleArmorClass } from '../math/armor-class';
import { getEffectiveAttribute, getEffectiveModifier } from '../math/attributes';
import { equippedItemIsLightMediumOrHeavyArmor, isShieldItem } from '../equipment/armor-items';
import { hasSelectedFightingStyle } from '../equipment/weapons';
import { isDraconicResilienceFeatureName } from '../features/subclass-features';
import {
  getEffectiveEpicBoonAbilityScore,
  getPrimalChampionBodyAndMindBonusFlags,
  getTotalAbilityScoreImprovementFromGains,
} from './ability-progression';
import { getEffectiveProficiencies } from './derived-character-stats';

/** Armor categories the character is trained in: `light` | `medium` | `heavy` | `shield`. */
export function getArmorProficiencyCategories(data: CharacterFormData): Set<string> {
  const set = new Set<string>();
  const profs = getEffectiveProficiencies(data);
  if (!profs) return set;
  for (const line of profs.split('\n')) {
    if (!/armor training/i.test(line)) continue;
    const afterColon = line.includes(':') ? line.split(':').slice(1).join(':') : line;
    const lower = afterColon.toLowerCase();
    const hasArmorWord = lower.includes('armor');
    if (hasArmorWord && lower.includes('light')) set.add('light');
    if (hasArmorWord && lower.includes('medium')) set.add('medium');
    if (hasArmorWord && lower.includes('heavy')) set.add('heavy');
    if (lower.includes('shield')) set.add('shield');
    if (lower.includes('all armor')) {
      set.add('light');
      set.add('medium');
      set.add('heavy');
    }
  }
  return set;
}

/** Whether the character is trained in this armor/shield item's category. */
export function isArmorItemProficient(
  item: RuleItemResponse | null,
  categories: Set<string>
): boolean {
  if (!item) return false;
  const norm = (item.normalized ?? {}) as Record<string, unknown>;
  const armorData = norm.armor as { category?: string | null } | null | undefined;
  const categoryLower = ((armorData?.category ?? '') as string).toLowerCase();
  if (isShieldItem(item)) return categories.has('shield');
  if (categoryLower.includes('light')) return categories.has('light');
  if (categoryLower.includes('medium')) return categories.has('medium');
  if (categoryLower.includes('heavy')) return categories.has('heavy');
  return false;
}

/** AC granted by an armor item (base + capped Dex); null when the item carries no armor data. */
export function computeArmorClassFromArmor(
  armorItem: RuleItemResponse | null,
  dexMod: number
): number | null {
  if (!armorItem) return null;
  const norm = (armorItem.normalized ?? {}) as Record<string, unknown>;
  const armorData = norm.armor as
    | { acBase?: number | null; acAddDexmod?: boolean | null; acCapDexmod?: number | null }
    | null
    | undefined;
  if (!armorData) return null;
  const base =
    typeof armorData.acBase === 'number' && !Number.isNaN(armorData.acBase)
      ? armorData.acBase
      : null;
  if (base == null) return null;
  if (armorData.acAddDexmod !== true) return base;
  const maxBonus =
    typeof armorData.acCapDexmod === 'number' && !Number.isNaN(armorData.acCapDexmod)
      ? armorData.acCapDexmod
      : null;
  return base + (maxBonus != null ? Math.min(dexMod, maxBonus) : dexMod);
}

/** Armor strength requirement met (or none required). */
function armorMeetsStrengthRequirement(
  equippedArmor: RuleItemResponse | null,
  strengthScore: number
): boolean {
  if (!equippedArmor) return true;
  const norm = (equippedArmor.normalized ?? {}) as Record<string, unknown>;
  const ad = norm.armor as { strengthScoreRequired?: number | null } | null | undefined;
  const required = ad?.strengthScoreRequired ?? null;
  if (required == null || typeof required !== 'number' || Number.isNaN(required)) return true;
  return strengthScore >= required;
}

export interface EffectiveArmorClassParams {
  data: CharacterFormData;
  /** Derived features (class/subclass/race/feats), the source for the AC feature flags. */
  featureDetails: FeatureDetail[];
  feats: RuleItemResponse[];
  /** Armor + shield catalog; only the equipped ids are looked up. */
  armors: RuleItemResponse[];
}

/** The character's real AC. Detection lives here; the SRD assembly rules stay in `assembleArmorClass`. */
export function computeEffectiveArmorClass({
  data,
  featureDetails,
  feats,
  armors,
}: EffectiveArmorClassParams): number {
  const { hasPrimalChampion, hasBodyAndMind } = getPrimalChampionBodyAndMindBonusFlags(data);
  const epicBoonAbilityScore = getEffectiveEpicBoonAbilityScore(data);

  const combinedAbilityBonuses = ((): Record<string, number> => {
    const bg = data.backgroundAbilityScoreIncrease ?? {};
    const asi = getTotalAbilityScoreImprovementFromGains(data.abilityScoreImprovementByGain);
    const out: Record<string, number> = {};
    for (const key of new Set([...Object.keys(bg), ...Object.keys(asi)])) {
      out[key] = (bg[key] ?? 0) + (asi[key] ?? 0);
    }
    return out;
  })();

  const modOf = (ability: string): number =>
    getEffectiveModifier(
      data.attributes ?? {},
      combinedAbilityBonuses,
      ability,
      epicBoonAbilityScore,
      hasPrimalChampion,
      hasBodyAndMind,
      data.grapplerAbilityScore
    );
  const dexMod = modOf('Dexterity');
  const strengthScore = getEffectiveAttribute(
    data.attributes ?? {},
    combinedAbilityBonuses,
    'Strength',
    epicBoonAbilityScore,
    hasPrimalChampion,
    hasBodyAndMind,
    data.grapplerAbilityScore
  );

  const unarmoredDefenseFeature = featureDetails.find(
    (f) => f.name.trim().toLowerCase() === 'unarmored defense'
  );
  const unarmoredDefenseText = (unarmoredDefenseFeature?.desc ?? '').toLowerCase();
  const bodyAndMindFeatureListed = featureDetails.some(
    (f) => f.name.trim().toLowerCase() === 'body and mind'
  );

  const equippedArmor = data.equippedArmorId
    ? (armors.find((a) => a.id === data.equippedArmorId) ?? null)
    : null;
  const equippedShield = data.equippedShieldId
    ? (armors.find((a) => a.id === data.equippedShieldId) ?? null)
    : null;

  const categories = getArmorProficiencyCategories(data);
  const canUseArmor =
    isArmorItemProficient(equippedArmor, categories) &&
    armorMeetsStrengthRequirement(equippedArmor, strengthScore);

  const baseFromData =
    data.armorClass !== '' && data.armorClass != null ? Number(data.armorClass) : NaN;

  return assembleArmorClass({
    storedBaseAc: Number.isNaN(baseFromData) ? undefined : baseFromData,
    dexMod,
    conMod: modOf('Constitution'),
    wisMod: modOf('Wisdom'),
    chaMod: modOf('Charisma'),
    armorAc: computeArmorClassFromArmor(canUseArmor ? equippedArmor : null, dexMod),
    hasArmorEquipped: !!equippedArmor,
    hasShieldEquipped: !!equippedShield,
    shieldBonusApplies: !!equippedShield && isArmorItemProficient(equippedShield, categories),
    hasUnarmoredDefense: !!unarmoredDefenseFeature,
    unarmoredDefenseUsesWis: bodyAndMindFeatureListed || unarmoredDefenseText.includes('wisdom'),
    unarmoredDefenseRequiresNoShield:
      unarmoredDefenseText.includes('wielding a shield') ||
      unarmoredDefenseText.includes('wield a shield'),
    hasDraconicResilience: featureDetails.some(
      (f) => f.source === 'subclass' && isDraconicResilienceFeatureName(f.name)
    ),
    defenseStyleApplies:
      hasSelectedFightingStyle(data, feats, 'defense') &&
      data.equippedArmorId != null &&
      equippedItemIsLightMediumOrHeavyArmor(equippedArmor),
  });
}
