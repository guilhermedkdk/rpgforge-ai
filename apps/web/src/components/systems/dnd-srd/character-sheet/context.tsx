'use client';

import { createContext, useContext, useMemo, useCallback, useEffect, type ReactNode } from 'react';
import {
  calcModifier,
  computeArmorClassFromArmor as computeArmorClassFromArmorShared,
  computeEffectiveArmorClass,
  getArmorItemsFromEquipment,
  getArmorProficiencyCategories,
  getDefaultAttributes,
  getEffectiveAttribute,
  getEffectiveEpicBoonAbilityScore,
  getEffectiveModifier,
  getExpertiseSelectionPrerequisiteMessage,
  getPrimalChampionBodyAndMindBonusFlags,
  getSkillsFromAbilities,
  isArmorItemProficient as isArmorItemProficientShared,
  isFastMovementFeature,
  isRovingFeature,
  isShieldItem,
  isThievesCantFeature,
  isUnarmoredMovementFeature,
  MAX_STANDARD_LANGUAGES_TOTAL,
  normalizeStandardLanguageNames,
  proficiencyBonusForLevel,
  computeDisplaySpeed,
  getCombinedAbilityBonuses,
  getDisplayFeatureDetails,
  retainSkillProficiencyFromClassOrBackground,
  type CharacterFormData,
  type RuleItemResponse,
} from '@rpgforce-ai/shared';
import type { CharacterSheetProps, SheetMode } from './types';
import { buildSheetLocks, type SheetLocks } from './locks';
import { useSheetPendingFlags, type PendingFlags } from './pending-flags';

/** Static rule item catalogs + loading flags — change only when fetches resolve. */
export interface RuleLibraryContextValue {
  classes: RuleItemResponse[];
  subclasses: RuleItemResponse[];
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
  subclassesLoading: boolean;
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
  computeArmorClassFromArmor: (armorItem: RuleItemResponse | null, dexMod: number) => number | null;

  effectiveArmorClassValue: string;
  displaySpeed: string;

  /** Weapon catalog for the Weapon Mastery picker; the budget itself is per granting class. */
  weaponMasteryMeta: {
    hasWeaponMasteryFeature: boolean;
    masteryWeapons: Array<{ id: string; name: string }>;
  };

  abilityMethod: CharacterFormData['abilityScoreMethod'];
  handleSetAbilityMethod: (m: CharacterFormData['abilityScoreMethod']) => void;
  mode: SheetMode;
  locks: SheetLocks;
}

// Holds only data + onChange + mode/locks + pendingFlags — recreated on every state change.
interface CharacterDataContextValue {
  data: CharacterFormData;
  onChange: (data: CharacterFormData) => void;
  mode: SheetMode;
  /** Committed creation allocations that render read-only; all false in creation mode. */
  locks: SheetLocks;
  /** After a blocked save, which pending fields are still flagged in red (per field). */
  pendingFlags: PendingFlags;
}

// Holds all computed/derived values — only recreated when those values change.
type CharacterComputedOnlyContextValue = Omit<
  CharacterSheetContextValue,
  'data' | 'onChange' | 'mode' | 'locks' | keyof RuleLibraryContextValue
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
  if (!ctx) throw new Error('useRuleLibraryData must be used within CharacterSheetProvider');
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

/** Only data + onChange + mode/locks. */
export function useCharacterData(): CharacterDataContextValue {
  const ctx = useContext(CharacterDataCtx);
  if (!ctx) throw new Error('useCharacterData must be used within CharacterSheetProvider');
  return ctx;
}

export function CharacterSheetProvider({
  data,
  classes,
  subclasses = [],
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
  subclassesLoading = false,
  backgroundsLoading,
  racesLoading,
  abilitiesLoading,
  equipmentItemsLoading,
  onChange,
  mode = 'creation',
  saveAttempted = false,
  children,
}: CharacterSheetProps & { children: ReactNode }) {
  const skillsList = useMemo(() => getSkillsFromAbilities(abilities), [abilities]);
  const featureDetails = data.featureDetails ?? [];

  const effectiveFeatureDetails = useMemo(() => getDisplayFeatureDetails(data), [data]);

  const { hasPrimalChampion, hasBodyAndMind } = useMemo(
    () => getPrimalChampionBodyAndMindBonusFlags(data),
    [data]
  );
  const hasUnarmoredDefense = useMemo(
    () => featureDetails.some((f) => f.name.trim().toLowerCase() === 'unarmored defense'),
    [featureDetails]
  );
  const hasAuraOfProtection = useMemo(
    () => featureDetails.some((f) => f.name.trim().toLowerCase() === 'aura of protection'),
    [featureDetails]
  );
  const hasFastMovement = useMemo(
    () => featureDetails.some(isFastMovementFeature),
    [featureDetails]
  );
  const hasRoving = useMemo(() => featureDetails.some(isRovingFeature), [featureDetails]);
  const hasUnarmoredMovement = useMemo(
    // Matchers prefer the stable mechanics key over the name: the SRD data ships a typo'd name
    // ("Unarmoed Movement"), so a name-only check silently never matches and the bonus is lost.
    () => featureDetails.some(isUnarmoredMovementFeature),
    [featureDetails]
  );

  const combinedAbilityBonuses = useMemo(
    () => getCombinedAbilityBonuses(data),
    [data.backgroundAbilityScoreIncrease, data.abilityScoreImprovementByGain]
  );

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
    ]
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
      data.grapplerAbilityScore
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
        data.grapplerAbilityScore
      ),
    [
      data.attributes,
      combinedAbilityBonuses,
      effectiveEpicBoonAbilityScore,
      hasPrimalChampion,
      hasBodyAndMind,
      data.grapplerAbilityScore,
    ]
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
        data.grapplerAbilityScore
      ),
    [
      data.attributes,
      combinedAbilityBonuses,
      effectiveEpicBoonAbilityScore,
      hasPrimalChampion,
      hasBodyAndMind,
      data.grapplerAbilityScore,
    ]
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
        data.grapplerAbilityScore
      ),
    [
      data.attributes,
      combinedAbilityBonuses,
      effectiveEpicBoonAbilityScore,
      hasPrimalChampion,
      hasBodyAndMind,
      data.grapplerAbilityScore,
    ]
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
        data.grapplerAbilityScore
      ),
    [
      data.attributes,
      combinedAbilityBonuses,
      effectiveEpicBoonAbilityScore,
      hasPrimalChampion,
      hasBodyAndMind,
      data.grapplerAbilityScore,
    ]
  );

  const armorItemsInEquipment = useMemo(
    () => getArmorItemsFromEquipment(data.equipment, armors),
    [data.equipment, armors]
  );

  const armorChoices = useMemo(
    () => armorItemsInEquipment.filter((a) => !isShieldItem(a)),
    [armorItemsInEquipment]
  );
  const shieldChoices = useMemo(
    () => armorItemsInEquipment.filter((a) => isShieldItem(a)),
    [armorItemsInEquipment]
  );

  const equippedArmor = useMemo(
    () =>
      data.equippedArmorId ? (armors.find((a) => a.id === data.equippedArmorId) ?? null) : null,
    [armors, data.equippedArmorId]
  );
  const equippedShield = useMemo(
    () =>
      data.equippedShieldId ? (armors.find((a) => a.id === data.equippedShieldId) ?? null) : null,
    [armors, data.equippedShieldId]
  );

  const isEquippedArmorHeavy = useMemo((): boolean => {
    if (!equippedArmor) return false;
    const norm = (equippedArmor.normalized ?? {}) as Record<string, unknown>;
    const armorData = norm.armor as { category?: string | null } | null | undefined;
    const category = String(armorData?.category ?? '').toLowerCase();
    return category.includes('heavy');
  }, [equippedArmor]);

  const armorProficiencyCategories = useMemo(
    () => getArmorProficiencyCategories(data),
    [data.proficiencies, data.raceTraitSelections]
  );

  const isArmorItemProficient = useCallback(
    (item: RuleItemResponse | null): boolean =>
      isArmorItemProficientShared(item, armorProficiencyCategories),
    [armorProficiencyCategories]
  );

  const computeArmorClassFromArmor = useCallback(
    (armorItem: RuleItemResponse | null, dexMod: number): number | null =>
      computeArmorClassFromArmorShared(armorItem, dexMod),
    []
  );

  // Detection + assembly both live in the shared domain, so the sheet, the backend recompute and
  // the sheets list can never disagree on the AC.
  const effectiveArmorClassValue = useMemo(
    () => String(computeEffectiveArmorClass({ data, featureDetails, feats, armors })),
    [data, featureDetails, feats, armors]
  );

  const proficiencyBonus = useMemo(
    (): number | undefined => (data.level < 1 ? undefined : proficiencyBonusForLevel(data.level)),
    [data.level]
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
      tableData.find((t) => t.label.trim().toLowerCase().includes('unarmored movement')) ??
      tableData[0];
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

  const displaySpeed = useMemo(
    () => String(computeDisplaySpeed({ data, featureDetails: effectiveFeatureDetails, armors })),
    [data, effectiveFeatureDetails, armors]
  );

  // Only the CATALOG lives here: how many a class may pick, and which it picked, are per class and
  // come from the shared helpers with that class's own feature row.
  const weaponMasteryMeta = useMemo(() => {
    const feature = featureDetails.find(
      (f) => f.source === 'class' && f.name.trim().toLowerCase() === 'weapon mastery'
    );

    const masteryWeapons = weapons
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
                .includes('mastery')
          ) ?? [];
        if (weaponProperties.length === 0) return null;
        return { id: w.id, name: w.name };
      })
      .filter(Boolean) as Array<{ id: string; name: string }>;

    return {
      hasWeaponMasteryFeature: !!feature,
      masteryWeapons: masteryWeapons ?? [],
    };
  }, [featureDetails, weapons]);

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
    [abilityMethod, data, onChange]
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

    if (data.raceTraitSelections && Object.keys(data.raceTraitSelections).length > 0) {
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
    if (!hasFeature('Expertise') && Object.keys(next.expertiseSkillKeysByClass ?? {}).length > 0) {
      changed = true;
      next = { ...next, expertiseSkillKeysByClass: {} };
    }
    if (!hasFeature('Scholar') && next.scholarExpertiseSkillKey) {
      changed = true;
      next = { ...next, scholarExpertiseSkillKey: null };
    }
    if (
      !hasFeature('Deft Explorer') &&
      (next.deftExplorerExpertiseSkillKey || (next.deftExplorerLanguageNames?.length ?? 0) > 0)
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
    if (
      !hasFeature('Weapon Mastery') &&
      Object.keys(next.weaponMasteryWeaponIdsByClass ?? {}).length > 0
    ) {
      changed = true;
      next = { ...next, weaponMasteryWeaponIdsByClass: {} };
    }
    if (!hasFeature('Fighting Style') && Object.keys(next.fightingStyleByClass ?? {}).length > 0) {
      changed = true;
      next = { ...next, fightingStyleByClass: {} };
    }
    if (!hasFeature('Bonus Proficiencies') && (next.bonusProficienciesSkillKeys?.length ?? 0) > 0) {
      const nextSkills = { ...next.skillProficiencies };
      for (const k of next.bonusProficienciesSkillKeys ?? []) {
        nextSkills[k] = retainSkillProficiencyFromClassOrBackground(next, k);
      }
      changed = true;
      next = { ...next, bonusProficienciesSkillKeys: [], skillProficiencies: nextSkills };
    }
    if (!hasFeature('Additional Fighting Style') && next.additionalFightingStyleFeatId) {
      changed = true;
      next = { ...next, additionalFightingStyleFeatId: null };
    }
    if (
      !hasFeature('Magical Discoveries') &&
      (next.magicalDiscoveriesSpellNames?.length ?? 0) > 0
    ) {
      changed = true;
      next = { ...next, magicalDiscoveriesSpellNames: [] };
    }
    if (
      !hasFeature('Evocation Savant') &&
      Object.keys(next.evocationSavantSpellbookByLevel ?? {}).length > 0
    ) {
      changed = true;
      next = { ...next, evocationSavantSpellbookByLevel: {} };
    }
    if (changed) onChange(next);
  }, [data, featureDetails, onChange]);

  // Auto-clear skill-feat selections when their prerequisite (class skills complete) is no longer met.
  useEffect(() => {
    if (featureDetails.length === 0) return;

    const prereqFailed = getExpertiseSelectionPrerequisiteMessage(data, skillsList) !== null;
    const deftExpertiseFailed =
      data.deftExplorerExpertiseSkillKey != null &&
      getExpertiseSelectionPrerequisiteMessage(data, skillsList, { forDeftExplorer: true }) !==
        null;

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
      if (changed)
        next = {
          ...next,
          raceTraitSelections: nextRaceTraitSelections,
          skillProficiencies: nextSkillProficiencies,
        };

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
          next.primalKnowledgeSkillKey
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
        (f) => f.source === 'class' && f.name.trim().toLowerCase() === 'deft explorer'
      )
    ) {
      return;
    }
    const normalized = normalizeStandardLanguageNames(
      data.standardLanguageNames,
      standardLanguageOptions
    );
    if (normalized.length >= MAX_STANDARD_LANGUAGES_TOTAL) return;
    if ((data.deftExplorerLanguageNames?.length ?? 0) === 0) return;
    onChange({ ...data, deftExplorerLanguageNames: [] });
  }, [data, featureDetails, standardLanguageOptions, onChange]);

  useEffect(() => {
    if (
      !featureDetails.some(
        (f) => f.source === 'class' && f.name.trim().toLowerCase() === 'deft explorer'
      )
    ) {
      return;
    }
    const normalized = normalizeStandardLanguageNames(
      data.standardLanguageNames,
      standardLanguageOptions
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
    if (!featureDetails.some((f) => f.source === 'class' && isThievesCantFeature(f))) {
      return;
    }
    const normalized = normalizeStandardLanguageNames(
      data.standardLanguageNames,
      standardLanguageOptions
    );
    if (normalized.length >= MAX_STANDARD_LANGUAGES_TOTAL) return;
    if (!String(data.thievesCantExtraLanguageName ?? '').trim()) return;
    onChange({ ...data, thievesCantExtraLanguageName: null });
  }, [data, featureDetails, standardLanguageOptions, onChange]);

  useEffect(() => {
    if (!featureDetails.some((f) => f.source === 'class' && isThievesCantFeature(f))) {
      return;
    }
    const normalized = normalizeStandardLanguageNames(
      data.standardLanguageNames,
      standardLanguageOptions
    );
    const langNorm = (s: string) => s.trim().toLowerCase();
    const standardSet = new Set(normalized.map(langNorm));
    const extra = String(data.thievesCantExtraLanguageName ?? '').trim();
    if (!extra) return;
    if (!standardSet.has(langNorm(extra))) return;
    onChange({ ...data, thievesCantExtraLanguageName: null });
  }, [data, featureDetails, standardLanguageOptions, onChange]);

  // Locks track what the sheet already committed, so they follow `data`, not just the mode.
  const locks = useMemo<SheetLocks>(
    () => buildSheetLocks(mode, data, { skillsList, standardLanguageOptions }),
    [mode, data, skillsList, standardLanguageOptions]
  );

  // data/onChange/mode/locks live in their own context so changes to them don't
  // invalidate the computed context (which is stable across text-only edits).
  const pendingFlags = useSheetPendingFlags(saveAttempted);

  const dataValue = useMemo<CharacterDataContextValue>(
    () => ({ data, onChange, mode, locks, pendingFlags }),
    [data, onChange, mode, locks, pendingFlags]
  );

  // Static catalogs: change only when fetches resolve, never on recalcs.
  const libraryValue = useMemo<RuleLibraryContextValue>(
    () => ({
      classes,
      subclasses,
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
      subclassesLoading,
      backgroundsLoading,
      racesLoading,
      abilitiesLoading,
      equipmentItemsLoading,
    }),
    [
      classes,
      subclasses,
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
      subclassesLoading,
      backgroundsLoading,
      racesLoading,
      abilitiesLoading,
      equipmentItemsLoading,
    ]
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
    ]
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
