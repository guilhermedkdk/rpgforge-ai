/**
 * Character form-data factory + persisted→form hydration + "fully chosen" validators.
 * Shared so the backend authoritative recompute reconstructs the EXACT same `CharacterFormData`
 * from a persisted sheet that the web editor builds on load (zero divergence by construction).
 */
import { PERSISTED_CHARACTER_SCHEMA_VERSION } from '../../../schemas/character-sheet-data';
import type { CharacterFormData } from './character-form-data';
import type { RuleItemResponse } from '../../../types/ruleitem';
import { countAvailableSpells, spellClassTag } from '../spells/spells';
import { getDefaultAttributes, getDefaultSavingThrows } from '../features/feature-matchers';
import {
  isMysticArcanumFeature,
  isSignatureSpellsFeature,
  isSpellMasteryFeature,
} from '../features/feature-mechanics';
import { coerceNonNegativeWalletInt, WALLET_COIN_MAX } from '../equipment/wallet';
import { flattenPersistedSheet, isPersistedCharacterSheet } from './character-persistence';
import { emptyClassEntry, syncClassMirrors } from './class-entries';

export function createDefaultCharacterData(): CharacterFormData {
  return {
    name: '',
    race: '',
    raceRuleItemId: null,
    // A fresh sheet starts with one empty class slot; picking a class fills it in place.
    classes: [emptyClassEntry()],
    className: '',
    classRuleItemId: null,
    subclass: '',
    subclassRuleItemId: null,
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
    hitDicePool: [],
    savingThrows: getDefaultSavingThrows(),
    skillProficiencies: {},
    classSkillProficiencyKeys: [],
    classSkillOptions: { keys: [], chooseN: null },
    classSkillProficiencyKeysByClass: {},
    classSkillOptionsByClass: {},
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
    weaponMasteryWeaponIdsByClass: {},
    primalKnowledgeSkillKey: null,
    expertiseSkillKeysByClass: {},
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
    evocationSavantSpellbookByLevel: {},
    abilityScoreImprovementByGain: [],
    equippedArmorId: null,
    equippedShieldId: null,
    epicBoonFeatId: null,
    epicBoonAbilityScore: null,
    versatileFeatId: null,
    grapplerAbilityScore: null,
    fightingStyleByClass: {},
    skilledProficiencyChoices: [],
    skilledChoicesBySource: {},
    bonusProficienciesSkillKeys: [],
    additionalFightingStyleFeatId: null,
    magicalDiscoveriesSpellNames: [],
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

  return syncClassMirrors({
    ...d,
    ...r,
    // A persisted sheet always yields at least one entry; an empty array would blank the mirrors.
    classes: Array.isArray(r.classes) && r.classes.length > 0 ? r.classes : d.classes,
    attributes: { ...d.attributes, ...(r.attributes ?? {}) },
    savingThrows: { ...d.savingThrows, ...(r.savingThrows ?? {}) },
    skillProficiencies: { ...d.skillProficiencies, ...(r.skillProficiencies ?? {}) },
    spellsByLevel,
    spellSlots: { ...d.spellSlots, ...(r.spellSlots ?? {}) },
    attacks: Array.isArray(r.attacks) && r.attacks.length > 0 ? r.attacks : d.attacks,
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
    weaponMasteryWeaponIdsByClass:
      r.weaponMasteryWeaponIdsByClass && typeof r.weaponMasteryWeaponIdsByClass === 'object'
        ? r.weaponMasteryWeaponIdsByClass
        : (d.weaponMasteryWeaponIdsByClass ?? {}),
    expertiseSkillKeysByClass:
      r.expertiseSkillKeysByClass && typeof r.expertiseSkillKeysByClass === 'object'
        ? r.expertiseSkillKeysByClass
        : (d.expertiseSkillKeysByClass ?? {}),
    deftExplorerLanguageNames: Array.isArray(r.deftExplorerLanguageNames)
      ? r.deftExplorerLanguageNames
      : (r.deftExplorerLanguageNames ?? []),
    metamagicOptionKeys: Array.isArray(r.metamagicOptionKeys)
      ? r.metamagicOptionKeys
      : (r.metamagicOptionKeys ?? []),
    eldritchInvocationSelections: Array.isArray(r.eldritchInvocationSelections)
      ? r.eldritchInvocationSelections
      : (d.eldritchInvocationSelections ?? []),
    pactOfTomeSpellNames:
      r.pactOfTomeSpellNames && typeof r.pactOfTomeSpellNames === 'object'
        ? r.pactOfTomeSpellNames
        : (d.pactOfTomeSpellNames ?? { cantrips: [], rituals: [] }),
    mysticArcanumSpellNamesByGain: Array.isArray(r.mysticArcanumSpellNamesByGain)
      ? r.mysticArcanumSpellNamesByGain
      : (r.mysticArcanumSpellNamesByGain ?? []),
    signatureSpellsSpellNames: Array.isArray(r.signatureSpellsSpellNames)
      ? r.signatureSpellsSpellNames
      : (r.signatureSpellsSpellNames ?? []),
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
    evocationSavantSpellbookByLevel: {
      ...d.evocationSavantSpellbookByLevel,
      ...(r.evocationSavantSpellbookByLevel ?? {}),
    },
    backgroundAbilityScoreIncrease: {
      ...d.backgroundAbilityScoreIncrease,
      ...(r.backgroundAbilityScoreIncrease ?? {}),
    },
    abilityScoreImprovementByGain: Array.isArray(r.abilityScoreImprovementByGain)
      ? r.abilityScoreImprovementByGain
      : (r.abilityScoreImprovementByGain ?? []),
    skilledProficiencyChoices: Array.isArray(r.skilledProficiencyChoices)
      ? r.skilledProficiencyChoices
      : (r.skilledProficiencyChoices ?? []),
    skilledChoicesBySource:
      r.skilledChoicesBySource && typeof r.skilledChoicesBySource === 'object'
        ? r.skilledChoicesBySource
        : (d.skilledChoicesBySource ?? {}),
    bonusProficienciesSkillKeys: Array.isArray(r.bonusProficienciesSkillKeys)
      ? r.bonusProficienciesSkillKeys
      : (d.bonusProficienciesSkillKeys ?? []),
    magicalDiscoveriesSpellNames: Array.isArray(r.magicalDiscoveriesSpellNames)
      ? r.magicalDiscoveriesSpellNames
      : (d.magicalDiscoveriesSpellNames ?? []),
    classSkillProficiencyKeysByClass: {
      ...d.classSkillProficiencyKeysByClass,
      ...(r.classSkillProficiencyKeysByClass ?? {}),
    },
    classSkillOptionsByClass: {
      ...d.classSkillOptionsByClass,
      ...(r.classSkillOptionsByClass ?? {}),
    },
    hitDicePool: Array.isArray(r.hitDicePool) ? r.hitDicePool : d.hitDicePool,
  });
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

/** Every Mystic Arcanum slot at the current level has a chosen spell name. */
export function isMysticArcanumFullyChosen(data: CharacterFormData): boolean {
  const feat = (data.featureDetails ?? []).find(
    (f) => f.source === 'class' && isMysticArcanumFeature(f)
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
    (f) => f.source === 'class' && isSignatureSpellsFeature(f)
  );
  if (!has) return true;
  const picks = data.signatureSpellsSpellNames ?? [];
  for (let i = 0; i < SIGNATURE_SPELLS_REQUIRED_SLOTS; i++) {
    if (!String(picks[i] ?? '').trim()) return false;
  }
  return true;
}

/**
 * Magic Initiate: every gain slot (from any source — background, ASI, …) has its spell list, ability,
 * 2 cantrips, and 1 level-1 spell. When `allSpells` is given, each requirement is capped at what the
 * chosen list can still offer (2 cantrips / 1 spell OR fewer, if the pool is exhausted by picks from
 * other sources), so a drained list never leaves the feat "pending". Single source of truth — used by
 * the editor's pending indicator AND the save gate, so front + back agree.
 */
export function isMagicInitiateFullyChosen(
  data: CharacterFormData,
  allSpells?: RuleItemResponse[]
): boolean {
  for (const g of data.magicInitiateChoicesByGain ?? []) {
    if (!g?.spellList || !g.spellcastingAbility) return false;
    const listTag = spellClassTag(g.spellList);
    // Cantrips already on the sheet from any OTHER source drain this slot's list.
    const own = new Set((g.cantripNames ?? []).filter(Boolean).map((n) => n!.toLowerCase()));
    const excluded = new Set<string>();
    for (const row of data.spellsByLevel?.[0] ?? []) {
      const nl = row.name.trim().toLowerCase();
      if (!own.has(nl)) excluded.add(nl);
    }
    const reqCantrips = allSpells
      ? Math.min(2, countAvailableSpells(allSpells, [listTag], 0, 0, excluded))
      : 2;
    if ((g.cantripNames ?? []).filter(Boolean).length < reqCantrips) return false;
    const reqSpell = allSpells ? Math.min(1, countAvailableSpells(allSpells, [listTag], 1, 1)) : 1;
    if (reqSpell > 0 && !g.spellName) return false;
  }
  return true;
}

/** Spell Mastery requires one pick for level 1 and one pick for level 2 when present. */
export function isSpellMasteryFullyChosen(data: CharacterFormData): boolean {
  const has = (data.featureDetails ?? []).some(
    (f) => f.source === 'class' && isSpellMasteryFeature(f)
  );
  if (!has) return true;
  const picks = data.spellMasterySpellNamesByLevel ?? {};
  return Boolean(String(picks[1] ?? '').trim()) && Boolean(String(picks[2] ?? '').trim());
}
