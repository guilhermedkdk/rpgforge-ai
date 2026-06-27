'use client';

import {
  createContext,
  useContext,
  useMemo,
  useCallback,
  useEffect,
  type ReactNode,
} from 'react';
import { proficiencyBonusForLevel, type RuleItemResponse } from '@rpgforce-ai/shared';
import {
  type CharacterFormData,
  calcModifier,
  getDefaultAttributes,
  getEffectiveAttribute,
  getEffectiveEpicBoonAbilityScore,
  getEffectiveModifier,
  getPrimalChampionBodyAndMindBonusFlags,
  getTotalAbilityScoreImprovementFromGains,
  isThievesCantFeatureName,
} from '@/lib/dnd-srd/character-state';
import { getEffectiveProficiencies } from '@/lib/dnd-srd/derived-character-stats';
import {
  isFastMovementFeature,
  isRovingFeature,
  isUnarmoredMovementFeature,
} from '@/lib/dnd-srd/feature-mechanics';
import { computeWeaponMasteryMaxSelections } from '@/lib/dnd-srd/weapon-mastery';
import type { CharacterSheetProps } from './types';
import {
  getSkillsFromAbilities,
  getArmorItemsFromEquipment,
  isShieldItem,
  normalizeStandardLanguageNames,
  hasSelectedFightingStyle,
  equippedItemIsLightMediumOrHeavyArmor,
  getExpertiseSelectionPrerequisiteMessage,
  retainSkillProficiencyFromClassOrBackground,
} from './helpers';
import { MAX_STANDARD_LANGUAGES_TOTAL } from './constants';

/** Static rule item catalogs + loading flags — change only when fetches resolve. */
export interface RuleLibraryContextValue {
  classes: RuleItemResponse[];
  backgrounds: RuleItemResponse[];
  races: RuleItemResponse[];
  abilities: RuleItemResponse[];
  weapons: RuleItemResponse[];
  armors: RuleItemResponse[];
  adventuringGear: RuleItemResponse[];
  feats: RuleItemResponse[];
  toolItemsByCategory: Record<string, RuleItemResponse[]>;
  standardLanguageOptions: RuleItemResponse[];

  classesLoading: boolean;
  backgroundsLoading: boolean;
  racesLoading: boolean;
  abilitiesLoading: boolean;
  equipmentItemsLoading: boolean;
}

export interface CharacterSheetContextValue extends RuleLibraryContextValue {
  data: CharacterFormData;
  onChange: (data: CharacterFormData) => void;

  proficiencyBonus: number | undefined;
  combinedAbilityBonuses: Record<string, number>;
  /** Epic Boon +1 target ability, only when ASI prerequisites + feat + ability are satisfied. */
  effectiveEpicBoonAbilityScore: string | null;
  featureDetails: NonNullable<CharacterFormData['featureDetails']>;
  skillsList: Array<{ key: string; name: string; abilityKey: string }>;

  hasPrimalChampion: boolean;
  hasBodyAndMind: boolean;
  hasUnarmoredDefense: boolean;
  hasAuraOfProtection: boolean;
  hasFastMovement: boolean;
  hasRoving: boolean;
  hasUnarmoredMovement: boolean;

  dexModifier: number;
  conModifier: number;
  wisModifier: number;
  strengthScore: number;
  auraOfProtectionBonus: number;
  unarmoredMovementBonus: number;

  equippedArmor: RuleItemResponse | null;
  equippedShield: RuleItemResponse | null;
  isEquippedArmorHeavy: boolean;
  armorItemsInEquipment: RuleItemResponse[];
  armorChoices: RuleItemResponse[];
  shieldChoices: RuleItemResponse[];
  armorProficiencyCategories: Set<string>;
  isShieldItem: (item: RuleItemResponse) => boolean;
  isArmorItemProficient: (item: RuleItemResponse | null) => boolean;
  computeArmorClassFromArmor: (
    armorItem: RuleItemResponse | null,
    dexMod: number,
  ) => number | null;

  effectiveArmorClassValue: string;
  displaySpeed: string;

  weaponMasteryMeta: {
    hasWeaponMasteryFeature: boolean;
    maxSelections: number;
    masteryWeapons: Array<{ id: string; name: string }>;
    currentSelections: string[];
  };

  abilityMethod: CharacterFormData['abilityScoreMethod'];
  handleSetAbilityMethod: (
    m: CharacterFormData['abilityScoreMethod'],
  ) => void;
  readOnly: boolean;
}

// Holds only data + onChange + readOnly + saveAttempted — recreated on every state change.
interface CharacterDataContextValue {
  data: CharacterFormData;
  onChange: (data: CharacterFormData) => void;
  readOnly: boolean;
  /** True after a blocked save attempt — sections flag their required-but-empty fields in red. */
  saveAttempted: boolean;
}

// Holds all computed/derived values — only recreated when those values change.
type CharacterComputedOnlyContextValue = Omit<
  CharacterSheetContextValue,
  'data' | 'onChange' | 'readOnly' | keyof RuleLibraryContextValue
>;

/** Backwards-compatible shape: computed values + rule library catalogs. */
type CharacterComputedContextValue = CharacterComputedOnlyContextValue & RuleLibraryContextValue;

const CharacterDataCtx = createContext<CharacterDataContextValue | null>(null);
const RuleLibraryCtx = createContext<RuleLibraryContextValue | null>(null);
const CharacterComputedCtx = createContext<CharacterComputedOnlyContextValue | null>(null);

/** Full context (data + computed). Causes re-render on any data change. */
export function useCharacterSheet(): CharacterSheetContextValue {
  const data = useContext(CharacterDataCtx);
  const library = useContext(RuleLibraryCtx);
  const computed = useContext(CharacterComputedCtx);
  if (!data || !library || !computed)
    throw new Error('useCharacterSheet must be used within CharacterSheetProvider');
  return { ...library, ...computed, ...data };
}

/**
 * Only the static rule item catalogs. Does NOT re-render on combat recalcs —
 * prefer this in sections that just need item lists (e.g. equipment pickers).
 */
export function useRuleLibraryData(): RuleLibraryContextValue {
  const ctx = useContext(RuleLibraryCtx);
  if (!ctx)
    throw new Error('useRuleLibraryData must be used within CharacterSheetProvider');
  return ctx;
}

/** Computed values + catalogs. Does NOT re-render when text-only fields change. */
export function useCharacterComputed(): CharacterComputedContextValue {
  const library = useContext(RuleLibraryCtx);
  const ctx = useContext(CharacterComputedCtx);
  if (!library || !ctx)
    throw new Error('useCharacterComputed must be used within CharacterSheetProvider');
  return useMemo(() => ({ ...library, ...ctx }), [library, ctx]);
}

/** Only data + onChange + readOnly. */
export function useCharacterData(): CharacterDataContextValue {
  const ctx = useContext(CharacterDataCtx);
  if (!ctx)
    throw new Error('useCharacterData must be used within CharacterSheetProvider');
  return ctx;
}


export function CharacterSheetProvider({
  data,
  classes,
  backgrounds,
  races,
  abilities,
  weapons,
  armors,
  adventuringGear = [],
  feats = [],
  toolItemsByCategory = {},
  standardLanguageOptions = [],
  classesLoading,
  backgroundsLoading,
  racesLoading,
  abilitiesLoading,
  equipmentItemsLoading,
  onChange,
  readOnly = false,
  saveAttempted = false,
  children,
}: CharacterSheetProps & { children: ReactNode }) {
  const skillsList = useMemo(
    () => getSkillsFromAbilities(abilities),
    [abilities],
  );
  const featureDetails = data.featureDetails ?? [];

  const elvenLineageFeat = featureDetails.find(
    (f) => f.source === 'race' && f.name.trim().toLowerCase() === 'elven lineage',
  );
  const selectedElvenLineage = elvenLineageFeat
    ? (data.raceTraitSelections?.[elvenLineageFeat.name] ?? null)
    : null;

  const effectiveFeatureDetails = useMemo(() => {
    if (selectedElvenLineage !== 'drow' && selectedElvenLineage !== 'wood-elf') {
      return featureDetails;
    }
    return featureDetails.map((f) => {
      if (f.source !== 'race') return f;
      const nameLower = f.name.trim().toLowerCase();
      if (selectedElvenLineage === 'drow' && nameLower === 'darkvision') {
        return { ...f, desc: f.desc.replace(/\b60\b/g, '120') };
      }
      if (selectedElvenLineage === 'wood-elf' && nameLower === 'speed') {
        return { ...f, desc: f.desc.replace(/\b30\b/g, '35') };
      }
      return f;
    });
  }, [featureDetails, selectedElvenLineage]);

  const { hasPrimalChampion, hasBodyAndMind } = useMemo(
    () => getPrimalChampionBodyAndMindBonusFlags(data),
    [data],
  );
  const hasUnarmoredDefense = useMemo(
    () =>
      featureDetails.some(
        (f) => f.name.trim().toLowerCase() === 'unarmored defense',
      ),
    [featureDetails],
  );
  const hasAuraOfProtection = useMemo(
    () =>
      featureDetails.some(
        (f) => f.name.trim().toLowerCase() === 'aura of protection',
      ),
    [featureDetails],
  );
  const hasFastMovement = useMemo(
    () => featureDetails.some(isFastMovementFeature),
    [featureDetails],
  );
  const hasRoving = useMemo(
    () => featureDetails.some(isRovingFeature),
    [featureDetails],
  );
  const hasUnarmoredMovement = useMemo(
    // Matchers prefer the stable mechanics key over the name: the SRD data ships a typo'd name
    // ("Unarmoed Movement"), so a name-only check silently never matches and the bonus is lost.
    () => featureDetails.some(isUnarmoredMovementFeature),
    [featureDetails],
  );

  const combinedAbilityBonuses = useMemo((): Record<string, number> => {
    const bg = data.backgroundAbilityScoreIncrease ?? {};
    const asi = getTotalAbilityScoreImprovementFromGains(data.abilityScoreImprovementByGain);
    const all = new Set([...Object.keys(bg), ...Object.keys(asi)]);
    const out: Record<string, number> = {};
    for (const k of all) {
      out[k] = (bg[k] ?? 0) + (asi[k] ?? 0);
    }
    return out;
  }, [data.backgroundAbilityScoreIncrease, data.abilityScoreImprovementByGain]);

  const effectiveEpicBoonAbilityScore = useMemo(
    () => getEffectiveEpicBoonAbilityScore(data),
    [
      data.abilityScoreMethod,
      data.attributes,
      data.background,
      data.backgroundRuleItemId,
      data.backgroundAbilityScoreOption,
      data.backgroundAbilityScoreIncrease,
      data.abilityScoreImprovementByGain,
      data.featureDetails,
      data.epicBoonFeatId,
      data.epicBoonAbilityScore,
    ],
  );

  const auraOfProtectionBonus = useMemo((): number => {
    if (!hasAuraOfProtection) return 0;
    const charismaScore = getEffectiveAttribute(
      data.attributes ?? {},
      combinedAbilityBonuses,
      'Charisma',
      effectiveEpicBoonAbilityScore,
      hasPrimalChampion,
      hasBodyAndMind,
      data.grapplerAbilityScore,
    );
    return Math.max(1, calcModifier(charismaScore));
  }, [
    hasAuraOfProtection,
    data.attributes,
    combinedAbilityBonuses,
    effectiveEpicBoonAbilityScore,
    hasPrimalChampion,
    hasBodyAndMind,
  ]);

  const dexModifier = useMemo(
    () =>
      getEffectiveModifier(
        data.attributes ?? {},
        combinedAbilityBonuses,
        'Dexterity',
        effectiveEpicBoonAbilityScore,
        hasPrimalChampion,
        hasBodyAndMind,
        data.grapplerAbilityScore,
      ),
    [
      data.attributes,
      combinedAbilityBonuses,
      effectiveEpicBoonAbilityScore,
      hasPrimalChampion,
      hasBodyAndMind,
      data.grapplerAbilityScore,
    ],
  );

  const strengthScore = useMemo(
    () =>
      getEffectiveAttribute(
        data.attributes ?? {},
        combinedAbilityBonuses,
        'Strength',
        effectiveEpicBoonAbilityScore,
        hasPrimalChampion,
        hasBodyAndMind,
        data.grapplerAbilityScore,
      ),
    [
      data.attributes,
      combinedAbilityBonuses,
      effectiveEpicBoonAbilityScore,
      hasPrimalChampion,
      hasBodyAndMind,
      data.grapplerAbilityScore,
    ],
  );

  const conModifier = useMemo(
    () =>
      getEffectiveModifier(
        data.attributes ?? {},
        combinedAbilityBonuses,
        'Constitution',
        effectiveEpicBoonAbilityScore,
        hasPrimalChampion,
        hasBodyAndMind,
        data.grapplerAbilityScore,
      ),
    [
      data.attributes,
      combinedAbilityBonuses,
      effectiveEpicBoonAbilityScore,
      hasPrimalChampion,
      hasBodyAndMind,
      data.grapplerAbilityScore,
    ],
  );

  const wisModifier = useMemo(
    () =>
      getEffectiveModifier(
        data.attributes ?? {},
        combinedAbilityBonuses,
        'Wisdom',
        effectiveEpicBoonAbilityScore,
        hasPrimalChampion,
        hasBodyAndMind,
        data.grapplerAbilityScore,
      ),
    [
      data.attributes,
      combinedAbilityBonuses,
      effectiveEpicBoonAbilityScore,
      hasPrimalChampion,
      hasBodyAndMind,
      data.grapplerAbilityScore,
    ],
  );

  const armorItemsInEquipment = useMemo(
    () => getArmorItemsFromEquipment(data.equipment, armors),
    [data.equipment, armors],
  );

  const armorChoices = useMemo(
    () => armorItemsInEquipment.filter((a) => !isShieldItem(a)),
    [armorItemsInEquipment],
  );
  const shieldChoices = useMemo(
    () => armorItemsInEquipment.filter((a) => isShieldItem(a)),
    [armorItemsInEquipment],
  );

  const equippedArmor = useMemo(
    () =>
      data.equippedArmorId
        ? (armors.find((a) => a.id === data.equippedArmorId) ?? null)
        : null,
    [armors, data.equippedArmorId],
  );
  const equippedShield = useMemo(
    () =>
      data.equippedShieldId
        ? (armors.find((a) => a.id === data.equippedShieldId) ?? null)
        : null,
    [armors, data.equippedShieldId],
  );

  const isEquippedArmorHeavy = useMemo((): boolean => {
    if (!equippedArmor) return false;
    const norm = (equippedArmor.normalized ?? {}) as Record<string, unknown>;
    const armorData = norm.armor as { category?: string | null } | null | undefined;
    const category = String(armorData?.category ?? '').toLowerCase();
    return category.includes('heavy');
  }, [equippedArmor]);

  const armorProficiencyCategories = useMemo(() => {
    const set = new Set<string>();
    const profs = getEffectiveProficiencies(data);
    if (!profs) return set;
    const lines = profs.split('\n');
    for (const line of lines) {
      if (!/armor training/i.test(line)) continue;
      const afterColon = line.includes(':')
        ? line.split(':').slice(1).join(':')
        : line;
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
  }, [data.proficiencies, data.raceTraitSelections]);

  const isArmorItemProficient = useCallback(
    (item: RuleItemResponse | null): boolean => {
      if (!item) return false;
      const norm = (item.normalized ?? {}) as Record<string, unknown>;
      const armorData = norm.armor as { category?: string | null } | null | undefined;
      const category = (armorData?.category ?? '') as string;
      const categoryLower = category.toLowerCase();
      if (isShieldItem(item)) return armorProficiencyCategories.has('shield');
      if (categoryLower.includes('light'))
        return armorProficiencyCategories.has('light');
      if (categoryLower.includes('medium'))
        return armorProficiencyCategories.has('medium');
      if (categoryLower.includes('heavy'))
        return armorProficiencyCategories.has('heavy');
      return false;
    },
    [armorProficiencyCategories],
  );

  const computeArmorClassFromArmor = useCallback(
    (armorItem: RuleItemResponse | null, dexMod: number): number | null => {
      if (!armorItem) return null;
      const norm = (armorItem.normalized ?? {}) as Record<string, unknown>;
      const armorData = norm.armor as
        | {
            acBase?: number | null;
            acAddDexmod?: boolean | null;
            acCapDexmod?: number | null;
          }
        | null
        | undefined;
      if (!armorData) return null;
      const base =
        typeof armorData.acBase === 'number' && !Number.isNaN(armorData.acBase)
          ? armorData.acBase
          : null;
      if (base == null) return null;
      const dexBonus = armorData.acAddDexmod === true;
      let total = base;
      if (dexBonus) {
        const maxBonus =
          typeof armorData.acCapDexmod === 'number' &&
          !Number.isNaN(armorData.acCapDexmod)
            ? armorData.acCapDexmod
            : null;
        const toAdd = maxBonus != null ? Math.min(dexMod, maxBonus) : dexMod;
        total += toAdd;
      }
      return total;
    },
    [],
  );

  const effectiveArmorClassValue = useMemo(() => {
    const baseFromData =
      data.armorClass !== '' && data.armorClass != null
        ? Number(data.armorClass)
        : NaN;
    const defaultBaseNoArmor =
      !Number.isNaN(baseFromData) && baseFromData > 0
        ? baseFromData
        : 10 + dexModifier;
    const unarmoredDefenseFeature = featureDetails.find(
      (f) => f.name.trim().toLowerCase() === 'unarmored defense',
    );
    const unarmoredDefenseText = (
      unarmoredDefenseFeature?.desc ?? ''
    ).toLowerCase();
    const bodyAndMindFeatureListed = featureDetails.some(
      (f) => f.name.trim().toLowerCase() === 'body and mind',
    );
    const unarmoredDefenseUsesWis =
      bodyAndMindFeatureListed || unarmoredDefenseText.includes('wisdom');
    const requiresNoShield =
      unarmoredDefenseText.includes('wielding a shield') ||
      unarmoredDefenseText.includes('wield a shield');
    const unarmoredDefenseBase =
      10 +
      dexModifier +
      (unarmoredDefenseUsesWis ? wisModifier : conModifier);

    const armorMeetsStr = (() => {
      if (!equippedArmor) return true;
      const norm = (equippedArmor.normalized ?? {}) as Record<string, unknown>;
      const ad = norm.armor as { strengthScoreRequired?: number | null } | null | undefined;
      const required = ad?.strengthScoreRequired ?? null;
      if (
        required == null ||
        typeof required !== 'number' ||
        Number.isNaN(required)
      )
        return true;
      return strengthScore >= required;
    })();

    const canUseArmor = isArmorItemProficient(equippedArmor) && armorMeetsStr;
    const armorAc = computeArmorClassFromArmor(
      canUseArmor ? equippedArmor : null,
      dexModifier,
    );
    let total: number;
    if (armorAc != null) {
      total = armorAc;
    } else {
      const canUseUnarmoredDefense =
        hasUnarmoredDefense &&
        !equippedArmor &&
        (!requiresNoShield || !equippedShield);
      total = canUseUnarmoredDefense
        ? unarmoredDefenseBase
        : defaultBaseNoArmor;
    }
    if (equippedShield && isArmorItemProficient(equippedShield)) {
      total += 2;
    }
    if (
      hasSelectedFightingStyle(data, feats, 'defense') &&
      data.equippedArmorId != null &&
      equippedItemIsLightMediumOrHeavyArmor(equippedArmor)
    ) {
      total += 1;
    }
    if (!Number.isFinite(total) || total < 0) return '0';
    return String(total);
  }, [
    data.armorClass,
    data.equippedArmorId,
    data.fightingStyleFeatId,
    data.raceTraitSelections,
    dexModifier,
    conModifier,
    wisModifier,
    hasUnarmoredDefense,
    featureDetails,
    computeArmorClassFromArmor,
    equippedArmor,
    equippedShield,
    isArmorItemProficient,
    strengthScore,
    feats,
  ]);

  const proficiencyBonus = useMemo(
    (): number | undefined => (data.level < 1 ? undefined : proficiencyBonusForLevel(data.level)),
    [data.level],
  );

  const unarmoredMovementBonus = useMemo((): number => {
    if (!hasUnarmoredMovement) return 0;
    const isUnarmored = !data.equippedArmorId && !data.equippedShieldId;
    if (!isUnarmored) return 0;
    const currentLevel = Math.max(1, Math.min(20, data.level ?? 1));
    const movementFeature = featureDetails.find(isUnarmoredMovementFeature);
    const tableData = movementFeature?.tableData ?? [];
    if (tableData.length === 0) return 0;
    const preferredTable =
      tableData.find((t) =>
        t.label.trim().toLowerCase().includes('unarmored movement'),
      ) ?? tableData[0];
    const eligibleRow = (preferredTable?.rows ?? [])
      .filter((r) => r.level <= currentLevel)
      .sort((a, b) => b.level - a.level)[0];
    const raw = eligibleRow?.value ?? '';
    const match = String(raw).match(/-?\d+/);
    if (!match) return 0;
    return Math.max(0, parseInt(match[0], 10));
  }, [
    data.equippedArmorId,
    data.equippedShieldId,
    data.level,
    featureDetails,
    hasUnarmoredMovement,
  ]);

  const displaySpeed = useMemo((): string => {
    const base = Number(data.speed) || 0;
    const woodElfBonus = selectedElvenLineage === 'wood-elf' ? 5 : 0;
    const fastMovementBonus =
      hasFastMovement && !isEquippedArmorHeavy ? 10 : 0;
    const rovingBonus = hasRoving && !isEquippedArmorHeavy ? 10 : 0;
    return String(base + woodElfBonus + fastMovementBonus + rovingBonus + unarmoredMovementBonus);
  }, [
    data.speed,
    selectedElvenLineage,
    hasFastMovement,
    hasRoving,
    isEquippedArmorHeavy,
    unarmoredMovementBonus,
  ]);

  const weaponMasteryMeta = useMemo(() => {
    const currentLevel = Math.max(1, Math.min(20, data.level ?? 1));
    const feature = featureDetails.find(
      (f) =>
        f.source === 'class' &&
        f.name.trim().toLowerCase() === 'weapon mastery',
    );
    const maxSelections = computeWeaponMasteryMaxSelections(feature, currentLevel);

    const masteryWeapons =
      weapons
        ?.map((w) => {
          const weaponNormFull = (w.normalized ?? {}) as {
            weapon?: {
              properties?: Array<{
                detail?: string | null;
                property?: {
                  name?: string | null;
                  desc?: string | null;
                  type?: string | null;
                } | null;
              }>;
            };
          };
          const weaponProperties =
            weaponNormFull.weapon?.properties?.filter(
              (p) =>
                p &&
                p.property &&
                typeof p.property.name === 'string' &&
                String(p.property.type ?? '')
                  .toLowerCase()
                  .includes('mastery'),
            ) ?? [];
          if (weaponProperties.length === 0) return null;
          return { id: w.id, name: w.name };
        })
        .filter(Boolean) as Array<{ id: string; name: string }>;

    return {
      hasWeaponMasteryFeature: !!feature,
      maxSelections,
      masteryWeapons: masteryWeapons ?? [],
      currentSelections: data.weaponMasteryWeaponIds ?? [],
    };
  }, [data.level, data.weaponMasteryWeaponIds, featureDetails, weapons]);

  const abilityMethod = data.abilityScoreMethod ?? 'standard-array';

  const handleSetAbilityMethod = useCallback(
    (newMethod: CharacterFormData['abilityScoreMethod']) => {
      if (newMethod === abilityMethod) return;
      // Changing the base score method invalidates any previously allocated
      // background bonus distribution from the other method.
      onChange({
        ...data,
        abilityScoreMethod: newMethod,
        attributes: getDefaultAttributes(newMethod),
        backgroundAbilityScoreIncrease: {},
      });
    },
    [abilityMethod, data, onChange],
  );

  // Feature-reset effect: clears stale feature choices when features appear/disappear
  useEffect(() => {
    // Slim saves omit featureDetails ([] until the parent editor derives from rule items).
    // With an empty list, every hasFeature() is false and raceTraitSelections would be
    // stripped; ASI / Weapon Mastery / etc. would also be cleared. Parent effects run
    // before child effects in the same commit, so this can fire before rehydration and
    // wipe persisted choices. Skip until we have derived rows.
    if (featureDetails.length === 0) return;

    const activeNames = new Set(featureDetails.map((f) => f.name));
    let changed = false;
    let next = data as typeof data;

    if (
      data.raceTraitSelections &&
      Object.keys(data.raceTraitSelections).length > 0
    ) {
      const kept: Record<string, string> = {};
      for (const [name, value] of Object.entries(data.raceTraitSelections)) {
        if (activeNames.has(name)) {
          kept[name] = value;
        } else {
          changed = true;
        }
      }
      if (changed) next = { ...next, raceTraitSelections: kept };
    }

    const normalizeFeatureName = (s: string) =>
      s
        .trim()
        .toLowerCase()
        .replace(/[^\w\s]/g, '')
        .replace(/\s+/g, ' ');
    const hasFeature = (name: string) =>
      featureDetails.some((f) => {
        const a = normalizeFeatureName(f.name);
        const b = normalizeFeatureName(name);
        return a.includes(b);
      });

    if (!hasFeature('Primal Knowledge') && next.primalKnowledgeSkillKey) {
      changed = true;
      next = { ...next, primalKnowledgeSkillKey: null };
    }
    if (
      !hasFeature('Expertise') &&
      (next.expertiseSkillKeys?.length ?? 0) > 0
    ) {
      changed = true;
      next = { ...next, expertiseSkillKeys: [] };
    }
    if (!hasFeature('Scholar') && next.scholarExpertiseSkillKey) {
      changed = true;
      next = { ...next, scholarExpertiseSkillKey: null };
    }
    if (
      !hasFeature('Deft Explorer') &&
      (next.deftExplorerExpertiseSkillKey ||
        (next.deftExplorerLanguageNames?.length ?? 0) > 0)
    ) {
      changed = true;
      next = {
        ...next,
        deftExplorerExpertiseSkillKey: null,
        deftExplorerLanguageNames: [],
      };
    }
    if (!hasFeature('Thieves Cant') && next.thievesCantExtraLanguageName) {
      changed = true;
      next = { ...next, thievesCantExtraLanguageName: null };
    }
    if (!hasFeature('Metamagic') && (next.metamagicOptionKeys?.length ?? 0) > 0) {
      changed = true;
      next = { ...next, metamagicOptionKeys: [] };
    }
    if (
      !hasFeature('Eldritch Invocations') &&
      (next.eldritchInvocationSelections?.length ?? 0) > 0
    ) {
      changed = true;
      next = { ...next, eldritchInvocationSelections: [] };
    }
    if (!hasFeature('Mystic Arcanum') && (next.mysticArcanumSpellNamesByGain?.length ?? 0) > 0) {
      changed = true;
      next = { ...next, mysticArcanumSpellNamesByGain: [] };
    }
    if (!hasFeature('Signature Spells') && (next.signatureSpellsSpellNames?.length ?? 0) > 0) {
      changed = true;
      next = { ...next, signatureSpellsSpellNames: [] };
    }
    if (
      !hasFeature('Spell Mastery') &&
      Object.keys(next.spellMasterySpellNamesByLevel ?? {}).length > 0
    ) {
      changed = true;
      next = { ...next, spellMasterySpellNamesByLevel: {} };
    }
    if (!hasFeature('Ability Score Improvement')) {
      if ((next.abilityScoreImprovementByGain?.length ?? 0) > 0) {
        changed = true;
        next = { ...next, abilityScoreImprovementByGain: undefined };
      }
    }
    if (!hasFeature('Epic Boon')) {
      if (next.epicBoonFeatId || next.epicBoonAbilityScore) {
        changed = true;
        next = { ...next, epicBoonFeatId: null, epicBoonAbilityScore: null };
      }
    }
    if (!hasFeature('Versatile') && next.versatileFeatId) {
      changed = true;
      next = { ...next, versatileFeatId: null };
    }
    if (!hasFeature('Weapon Mastery') && next.weaponMasteryWeaponIds) {
      changed = true;
      next = { ...next, weaponMasteryWeaponIds: undefined };
    }
    if (
      !hasFeature('Fighting Style') &&
      (next.fightingStyleFeatId || next.fightingStyleMode === 'FEAT')
    ) {
      changed = true;
      next = { ...next, fightingStyleFeatId: null, fightingStyleMode: 'OPTION' };
    }
    if (changed) onChange(next);
  }, [data, featureDetails, onChange]);

  // Auto-clear skill-feat selections when their prerequisite (class skills complete) is no longer met.
  useEffect(() => {
    if (featureDetails.length === 0) return;

    const prereqFailed =
      getExpertiseSelectionPrerequisiteMessage(data, skillsList) !== null;
    const deftExpertiseFailed =
      data.deftExplorerExpertiseSkillKey != null &&
      getExpertiseSelectionPrerequisiteMessage(data, skillsList, { forDeftExplorer: true }) !== null;

    if (!prereqFailed && !deftExpertiseFailed) return;

    let next = data;
    let changed = false;
    const SKILL_PREREQ_TRAIT_NAMES = new Set(['keen senses', 'skillful']);

    if (prereqFailed) {
      // Clear Keen Senses / Skillful race trait skill picks
      const nextRaceTraitSelections = { ...(next.raceTraitSelections ?? {}) };
      const nextSkillProficiencies = { ...(next.skillProficiencies ?? {}) };
      for (const [traitName, sel] of Object.entries(nextRaceTraitSelections)) {
        if (!SKILL_PREREQ_TRAIT_NAMES.has(traitName.trim().toLowerCase())) continue;
        if (!sel) continue;
        nextSkillProficiencies[sel] = retainSkillProficiencyFromClassOrBackground(next, sel);
        delete nextRaceTraitSelections[traitName];
        changed = true;
      }
      if (changed) next = { ...next, raceTraitSelections: nextRaceTraitSelections, skillProficiencies: nextSkillProficiencies };

      // Clear Skilled feat picks
      if ((next.skilledProficiencyChoices ?? []).length > 0) {
        const nextSkills = { ...(next.skillProficiencies ?? {}) };
        for (const choice of next.skilledProficiencyChoices ?? []) {
          if (choice.startsWith('skill:')) {
            const key = choice.slice('skill:'.length);
            if (key) nextSkills[key] = retainSkillProficiencyFromClassOrBackground(next, key);
          }
        }
        next = { ...next, skilledProficiencyChoices: [], skillProficiencies: nextSkills };
        changed = true;
      }

      // Clear Primal Knowledge
      if (next.primalKnowledgeSkillKey) {
        const nextSkills = { ...(next.skillProficiencies ?? {}) };
        nextSkills[next.primalKnowledgeSkillKey] = retainSkillProficiencyFromClassOrBackground(
          next,
          next.primalKnowledgeSkillKey,
        );
        next = { ...next, primalKnowledgeSkillKey: null, skillProficiencies: nextSkills };
        changed = true;
      }
    }

    if (deftExpertiseFailed && next.deftExplorerExpertiseSkillKey) {
      next = { ...next, deftExplorerExpertiseSkillKey: null };
      changed = true;
    }

    if (changed) onChange(next);
  }, [
    data.classSkillProficiencyKeys,
    data.backgroundSkillKeys,
    data.classRuleItemId,
    data.backgroundRuleItemId,
    featureDetails,
    skillsList,
    onChange,
    data,
  ]);

  useEffect(() => {
    if (
      !featureDetails.some(
        (f) =>
          f.source === 'class' &&
          f.name.trim().toLowerCase() === 'deft explorer',
      )
    ) {
      return;
    }
    const normalized = normalizeStandardLanguageNames(
      data.standardLanguageNames,
      standardLanguageOptions,
    );
    if (normalized.length >= MAX_STANDARD_LANGUAGES_TOTAL) return;
    if ((data.deftExplorerLanguageNames?.length ?? 0) === 0) return;
    onChange({ ...data, deftExplorerLanguageNames: [] });
  }, [data, featureDetails, standardLanguageOptions, onChange]);

  useEffect(() => {
    if (
      !featureDetails.some(
        (f) =>
          f.source === 'class' &&
          f.name.trim().toLowerCase() === 'deft explorer',
      )
    ) {
      return;
    }
    const normalized = normalizeStandardLanguageNames(
      data.standardLanguageNames,
      standardLanguageOptions,
    );
    const langNorm = (s: string) => s.trim().toLowerCase();
    const standardSet = new Set(normalized.map(langNorm));
    const deft = data.deftExplorerLanguageNames ?? [];
    if (deft.length === 0) return;
    const nextDeft = deft.filter((n) => !standardSet.has(langNorm(n)));
    if (nextDeft.length === deft.length) return;
    onChange({ ...data, deftExplorerLanguageNames: nextDeft });
  }, [data, featureDetails, standardLanguageOptions, onChange]);

  useEffect(() => {
    if (
      !featureDetails.some(
        (f) => f.source === 'class' && isThievesCantFeatureName(f.name),
      )
    ) {
      return;
    }
    const normalized = normalizeStandardLanguageNames(
      data.standardLanguageNames,
      standardLanguageOptions,
    );
    if (normalized.length >= MAX_STANDARD_LANGUAGES_TOTAL) return;
    if (!String(data.thievesCantExtraLanguageName ?? '').trim()) return;
    onChange({ ...data, thievesCantExtraLanguageName: null });
  }, [data, featureDetails, standardLanguageOptions, onChange]);

  useEffect(() => {
    if (
      !featureDetails.some(
        (f) => f.source === 'class' && isThievesCantFeatureName(f.name),
      )
    ) {
      return;
    }
    const normalized = normalizeStandardLanguageNames(
      data.standardLanguageNames,
      standardLanguageOptions,
    );
    const langNorm = (s: string) => s.trim().toLowerCase();
    const standardSet = new Set(normalized.map(langNorm));
    const extra = String(data.thievesCantExtraLanguageName ?? '').trim();
    if (!extra) return;
    if (!standardSet.has(langNorm(extra))) return;
    onChange({ ...data, thievesCantExtraLanguageName: null });
  }, [data, featureDetails, standardLanguageOptions, onChange]);

  // data/onChange/readOnly live in their own context so changes to them don't
  // invalidate the computed context (which is stable across text-only edits).
  const dataValue = useMemo<CharacterDataContextValue>(
    () => ({ data, onChange, readOnly, saveAttempted }),
    [data, onChange, readOnly, saveAttempted],
  );

  // Static catalogs: change only when fetches resolve, never on recalcs.
  const libraryValue = useMemo<RuleLibraryContextValue>(
    () => ({
      classes,
      backgrounds,
      races,
      abilities,
      weapons,
      armors,
      adventuringGear,
      feats,
      toolItemsByCategory,
      standardLanguageOptions,
      classesLoading,
      backgroundsLoading,
      racesLoading,
      abilitiesLoading,
      equipmentItemsLoading,
    }),
    [
      classes,
      backgrounds,
      races,
      abilities,
      weapons,
      armors,
      adventuringGear,
      feats,
      toolItemsByCategory,
      standardLanguageOptions,
      classesLoading,
      backgroundsLoading,
      racesLoading,
      abilitiesLoading,
      equipmentItemsLoading,
    ],
  );

  // Computed values: only recreated when the underlying derived values change.
  // Crucially, `data` is NOT in this dep array — so typing in personality/name
  // does not cause sections that only read computed values to re-render.
  const computedValue = useMemo<CharacterComputedOnlyContextValue>(
    () => ({
      proficiencyBonus,
      combinedAbilityBonuses,
      effectiveEpicBoonAbilityScore,
      featureDetails: effectiveFeatureDetails,
      skillsList,
      hasPrimalChampion,
      hasBodyAndMind,
      hasUnarmoredDefense,
      hasAuraOfProtection,
      hasFastMovement,
      hasRoving,
      hasUnarmoredMovement,
      dexModifier,
      conModifier,
      wisModifier,
      strengthScore,
      auraOfProtectionBonus,
      unarmoredMovementBonus,
      equippedArmor,
      equippedShield,
      isEquippedArmorHeavy,
      armorItemsInEquipment,
      armorChoices,
      shieldChoices,
      armorProficiencyCategories,
      isShieldItem,
      isArmorItemProficient,
      computeArmorClassFromArmor,
      effectiveArmorClassValue,
      displaySpeed,
      weaponMasteryMeta,
      abilityMethod,
      handleSetAbilityMethod,
    }),
    [
      proficiencyBonus,
      combinedAbilityBonuses,
      effectiveEpicBoonAbilityScore,
      effectiveFeatureDetails,
      skillsList,
      hasPrimalChampion,
      hasBodyAndMind,
      hasUnarmoredDefense,
      hasAuraOfProtection,
      hasFastMovement,
      hasRoving,
      hasUnarmoredMovement,
      dexModifier,
      conModifier,
      wisModifier,
      strengthScore,
      auraOfProtectionBonus,
      unarmoredMovementBonus,
      equippedArmor,
      equippedShield,
      isEquippedArmorHeavy,
      armorItemsInEquipment,
      armorChoices,
      shieldChoices,
      armorProficiencyCategories,
      isArmorItemProficient,
      computeArmorClassFromArmor,
      effectiveArmorClassValue,
      displaySpeed,
      weaponMasteryMeta,
      abilityMethod,
      handleSetAbilityMethod,
    ],
  );

  return (
    <CharacterDataCtx.Provider value={dataValue}>
      <RuleLibraryCtx.Provider value={libraryValue}>
        <CharacterComputedCtx.Provider value={computedValue}>
          {children}
        </CharacterComputedCtx.Provider>
      </RuleLibraryCtx.Provider>
    </CharacterDataCtx.Provider>
  );
}
