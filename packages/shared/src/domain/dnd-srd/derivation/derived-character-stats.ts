/**
 * Derives sheet fields (hitDice, speed, proficiencies, features, savingThrows)
 * from the normalized column of the class, race and background rule items.
 * Used in manual creation to fill and lock these fields.
 *
 * Runs once per class the character has levels in: class and subclass features are filtered by
 * THAT class's level, while saves, the full starting proficiencies and the starting equipment come
 * from the initial class only, per the SRD 5.2 multiclassing rules.
 */
import type { RuleItemResponse } from '../../../types/ruleitem';
import {
  readClassMulticlassing,
  type MulticlassGrants,
} from '../../../schemas/class-multiclassing';
import type { HitDicePoolEntry } from '../character/character-form-data';
import { formatHitDicePool } from '../character/class-entries';
import { findClassFeatures, sumClassFeatureGainCount } from '../features/feature-scope';
import { hitDieMaxFromNotation } from '../math/hit-points';
import { recomputeCombatStats } from '../math/combat-stats';
import {
  parseSkillProficienciesText,
  parseStartingEquipmentOptions,
  parseTableLikeToMap,
  parseAllowedAbilityNamesFromDesc,
  parseTraitOptions,
  parseMetamagicOptions,
  parseEldritchInvocationOptions,
  areStartingEquipmentParsedOptionsEquivalent,
  getEquipmentWithoutSource,
  normalizeStartingEquipmentOptionTextForCompare,
  splitEquipmentBySource,
  SELECTABLE_TRAIT_KEYWORDS,
} from '../options/character-options';
import type {
  AbilityScoreImprovementGainChoice,
  CharacterFormData,
  EldritchInvocationSelection,
  FeatureDetail,
} from '../character/character-form-data';
import {
  injectSpellcastingTablePlaceholders,
  normalizeFeatureDesc,
  normalizeSpellListLevelHeadings,
} from './feature-desc-normalization';
import {
  getGainedAtEntriesAtOrBefore,
  getGainedAtLevels,
  parseRepeatGainLevelsFromDesc,
} from './feature-gains';
import {
  reconcileMagicInitiateChoices,
  reconcileSkilledChoices,
} from './feat-source-reconciliation';
import { columnKeySlug, columnSlug, extractColumnReferences } from '../features/feature-column-tables';
import {
  DIVINE_ORDER_DISPLAY_NAME,
  PRIMAL_ORDER_DISPLAY_NAME,
  getDefaultSavingThrows,
  getFightingStyleCantripGrant,
  
  isUnarmoredMovementFeatureName,
} from '../features/feature-matchers';
import { isEldritchInvocationsFeature, isMysticArcanumFeature,
  isThievesCantFeature } from '../features/feature-mechanics';
import {
  canApplyAbilityScoreImprovementASI,
  DND_ATTRIBUTES,
  getEffectiveEpicBoonAbilityScore,
  getPrimalChampionBodyAndMindBonusFlags,
  getTotalAbilityScoreImprovementFromGains,
  maxAsiBonusForAttribute,
  sumIncreaseScoresInGain,
} from './ability-progression';
import { getEffectiveModifier } from '../math/attributes';
import { getBonusClassSkillBudgetExemptKeys } from '../proficiencies/skills';
import { reconcileFeatPrerequisites } from '../features/feat-prerequisites';
import { pruneEldritchInvocationSelections } from '../features/eldritch-invocations';
import {
  evocationSavantFreeSpellCount,
  evocationSavantIncrementalFreeCount,
  EVOCATION_SAVANT_BASE_MAX_LEVEL,
  fullCasterMaxSpellLevel,
  getSubclassSimpleOptions,
  isAdditionalFightingStyleFeatureName,
  isBonusProficienciesFeatureName,
  isDraconicResilienceFeatureName,
  isEvocationSavantFeatureName,
  isMagicalDiscoveriesFeatureName,
  subclassFeatureHasTraitOptionChoice,
} from '../features/subclass-features';
import { getEldritchInvocationsKnown } from '../spells/spellcasting-limits';
import {
  getWeaponMasteryMaxForFeature,
  weaponMasteryClassKey,
} from '../features/weapon-mastery';
import { fightingStyleClassKey } from '../features/fighting-style';
import {
  expertiseClassKey,
  getAllExpertiseSkillKeys,
  getExpertiseMaxForFeature,
} from '../features/expertise';

// Keeps only castable-level picks within the free quota (lowest level first). Enforces the SRD
// structure: the base grant is 2 spells of level <= 2, and only the incremental picks (1 per new
// slot level) may exceed level 2 — so picks above level 2 are capped separately.
function clampEvocationSavantSpellbook(
  src: Record<number, string[]> | undefined,
  characterLevel: number
): Record<number, string[]> {
  const maxSpellLevel = fullCasterMaxSpellLevel(characterLevel);
  let budget = evocationSavantFreeSpellCount(characterLevel);
  let highBudget = evocationSavantIncrementalFreeCount(characterLevel);
  const out: Record<number, string[]> = {};
  for (let lvl = 1; lvl <= maxSpellLevel; lvl++) {
    const names = (src?.[lvl] ?? []).filter((n) => String(n ?? '').trim().length > 0);
    if (names.length === 0 || budget <= 0) continue;
    let allowed = Math.min(names.length, budget);
    if (lvl > EVOCATION_SAVANT_BASE_MAX_LEVEL) allowed = Math.min(allowed, highBudget);
    if (allowed <= 0) continue;
    out[lvl] = names.slice(0, allowed);
    budget -= out[lvl].length;
    if (lvl > EVOCATION_SAVANT_BASE_MAX_LEVEL) highBudget -= out[lvl].length;
  }
  return out;
}

function parseSpeedToNumber(speed: string | undefined): number {
  if (!speed || typeof speed !== 'string') return 0;
  const match = speed.match(/\d+/);
  return match ? parseInt(match[0], 10) : 0;
}

function normalizeHitDice(text: string | undefined): string {
  if (!text || typeof text !== 'string') return '';
  const match = text.match(/(\d+)\s*[dD]\s*(\d+)/);
  return match ? `${match[1].toLowerCase()}d${match[2]}` : text.trim();
}

/**
 * Merges proficiency lines that share the same label (e.g. "Tool Proficiencies"
 * from class and background) into a single line with combined values.
 */
function mergeProficiencyLines(parts: string[]): string[] {
  const byLabel = new Map<string, string[]>();
  const order: string[] = [];
  for (const line of parts) {
    const idx = line.indexOf(': ');
    if (idx === -1) continue;
    const label = line.slice(0, idx).trim();
    const value = line.slice(idx + 2).trim();
    if (!value) continue;
    if (!byLabel.has(label)) {
      byLabel.set(label, []);
      order.push(label);
    }
    byLabel.get(label)!.push(value);
  }
  return order.map((label) => {
    const values = byLabel.get(label)!;
    return `${label}: ${values.join(', ')}`;
  });
}

/**
 * Proficiencies granted by feature-option choices (not class defaults), merged on top of the
 * class/race/background proficiencies. Cleric Divine Order → Protector grants Martial weapons +
 * Heavy armor; Druid Primal Order → Warden grants Martial weapons + Medium armor.
 *
 * Applied at read time (see `getEffectiveProficiencies`) rather than baked into `data.proficiencies`:
 * the full derivation does not re-run when a `raceTraitSelections` option is toggled, so the only
 * way for the change to be reactive is to keep `data.proficiencies` as the pure class base and layer
 * the option grants on top wherever the string is consumed. Idempotent because the base never
 * contains the option-granted entries (Divine Order is Cleric-only; Cleric lacks Martial/Heavy).
 */
function applyOptionGrantedProficiencies(
  proficiencies: string,
  raceTraitSelections: Record<string, string> | undefined,
): string {
  const extra: string[] = [];
  if (raceTraitSelections?.[DIVINE_ORDER_DISPLAY_NAME] === 'protector') {
    extra.push('Weapon Proficiencies: Martial weapons');
    extra.push('Armor Training: Heavy armor');
  }
  if (raceTraitSelections?.[PRIMAL_ORDER_DISPLAY_NAME] === 'warden') {
    extra.push('Weapon Proficiencies: Martial weapons');
    extra.push('Armor Training: Medium armor');
  }
  if (extra.length === 0) return proficiencies;
  const baseParts = proficiencies ? proficiencies.split('\n') : [];
  return mergeProficiencyLines([...baseParts, ...extra]).join('\n');
}

/**
 * The character's proficiencies string with feature-option grants (e.g. Divine Order → Protector)
 * layered on. Single source of truth for every consumer of the proficiencies string so the option
 * grants stay reactive and consistent across display, attacks and armor checks.
 */
export function getEffectiveProficiencies(data: CharacterFormData): string {
  return applyOptionGrantedProficiencies(data.proficiencies ?? '', data.raceTraitSelections);
}

function toolChooseKeyStillReferencedInDerived(derivedBlob: string, segmentKey: string): boolean {
  const raw = derivedBlob ?? '';
  if (!segmentKey.trim()) return false;
  if (raw.includes(segmentKey)) return true;
  const want = normalizeStartingEquipmentOptionTextForCompare(segmentKey);
  if (!want) return false;
  for (const rawLine of raw.split('\n')) {
    const line = rawLine.trim();
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const labelPart = line.slice(0, colonIdx).trim().toLowerCase();
    if (!labelPart.includes('tool')) continue;
    const valuePart = line.slice(colonIdx + 1).trim();
    if (!valuePart) continue;
    const segments = valuePart
      .split(/\s*,\s*/)
      .map((s) => s.trim())
      .filter(Boolean);
    for (const segment of segments) {
      if (normalizeStartingEquipmentOptionTextForCompare(segment) === want) return true;
    }
  }
  return false;
}

// `FeatureDetail` (the element shape of `featureDetails`) is imported from ./character-form-data —
// single source of truth, so it never diverges from the persisted `CharacterFormData` shape.

/** Background ability-score bonus: total points, cap per ability, and list of allowed abilities. */
export interface BackgroundAbilityScoreOption {
  totalPoints: number;
  maxPerAbility: number;
  /** Canonical names of abilities that can receive the bonus (e.g. ['Constitution', 'Intelligence', 'Wisdom']). If empty, all 6 are allowed. */
  allowedAbilityNames: string[];
}

export interface DerivedCharacterStats {
  /** Notation of the INITIAL class's die; the full pool is `hitDicePool`. */
  hitDice: string;
  /** One entry per class, in class order. Index 0 gets the level 1 maximum-die hit points. */
  hitDicePool: HitDicePoolEntry[];
  /** Sum of the class levels, clamped to 1-20. */
  totalLevel: number;
  speed: number;
  proficiencies: string;
  features: string;
  featureDetails: FeatureDetail[];
  savingThrows: Record<string, boolean>;
  /** Skill keys (e.g. athletics, insight) marked as proficient by the background. */
  skillProficiencies: Record<string, boolean>;
  /** Skills the INITIAL class allows choosing (for popover); chooseN = how many to choose. */
  classSkillOptions: { keys: string[]; chooseN: number | null };
  /** Per-class skill menus: a multiclassed class grants a reduced choice, or none at all. */
  classSkillOptionsByClass: Record<string, { keys: string[]; chooseN: number | null }>;
  /** Class starting-equipment options (label from the data, e.g. "Starting Equipment"). */
  startingEquipmentOptions: { label: string; options: { label: string; text: string }[] } | null;
  /** Background equipment options (label from the data, e.g. "Equipment"). */
  backgroundEquipmentOptions: { label: string; options: { label: string; text: string }[] } | null;
  /** Whether the background grants an ability-score bonus (e.g. +3 points, max +2 per ability). */
  backgroundAbilityScoreOption: BackgroundAbilityScoreOption | null;
}

function parseKeenSensesSkillOptions(desc: string): Array<{ key: string; label: string }> {
  if (!desc?.trim()) return [];
  const m = desc.match(/proficiency in\s+(?:the\s+)?(.+?)\s+skills?\b/i);
  if (!m) return [];
  const { keys } = parseSkillProficienciesText(`Choose one: ${m[1].trim()}`);
  if (keys.length === 0) return [];
  return keys.map((key) => ({
    key,
    label: key.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
  }));
}


function getFeatDescription(feat: RuleItemResponse): string {
  if (feat.contentMd?.trim()) return feat.contentMd.trim();
  const raw = (feat.raw ?? {}) as Record<string, unknown>;
  const benefits = raw.benefits as Array<{ desc?: string }> | undefined;
  if (Array.isArray(benefits) && benefits.length > 0) {
    return benefits
      .map((b) => (b.desc ?? '').trim())
      .filter(Boolean)
      .join('\n\n');
  }
  const d = raw.desc as string | undefined;
  return typeof d === 'string' ? d.trim() : '';
}

function isSelectableTrait(name: string): boolean {
  const lower = name.toLowerCase();
  return SELECTABLE_TRAIT_KEYWORDS.some((k) => lower.includes(k));
}

/**
 * The reduced skill choice a class grants on multiclass, phrased like a core-traits row so the same
 * parser handles it. 'class-list' reuses the class's own list rather than duplicating it in config.
 */
function multiclassSkillChoiceText(
  skillChoice: MulticlassGrants['skillChoice'],
  classSkillRow: string | undefined,
): string | undefined {
  if (!skillChoice) return undefined;
  if (skillChoice.from === 'any') return `Choose any ${skillChoice.count} skills`;
  if (!classSkillRow) return undefined;
  // Re-label the class's own option list with the smaller count.
  const afterColon = classSkillRow.includes(':')
    ? classSkillRow.split(':').slice(1).join(':').trim()
    : classSkillRow;
  return `Choose ${skillChoice.count}: ${afterColon}`;
}


/** One class the character has levels in, with its own subclass and level. */
export interface DeriveClassInput {
  classItem: RuleItemResponse | null;
  subclassItem?: RuleItemResponse | null;
  /** Level in THIS class, which is what class/subclass features are filtered against. */
  level: number;
}

export interface DeriveCharacterInput {
  /** In class order: index 0 is the INITIAL class (saves, full proficiencies, starting equipment). */
  classes: DeriveClassInput[];
  raceItem: RuleItemResponse | null;
  backgroundItem: RuleItemResponse | null;
  feats?: RuleItemResponse[];
  /** All skills (e.g. Skillful trait: choose 1). */
  allSkillOptions?: Array<{ key: string; label: string }>;
}

export function getDerivedFromRuleItems(input: DeriveCharacterInput): DerivedCharacterStats {
  const { raceItem, backgroundItem, feats, allSkillOptions } = input;
  const classEntries = (input.classes ?? []).filter((c) => c.classItem?.normalized);
  const savingThrows = { ...getDefaultSavingThrows() };
  // Initialize all known skills to false so the persisted map is always complete.
  const skillProficiencies: Record<string, boolean> = {};
  for (const s of allSkillOptions ?? []) {
    skillProficiencies[s.key] = false;
  }
  let classSkillOptions: { keys: string[]; chooseN: number | null } = { keys: [], chooseN: null };
  const classSkillOptionsByClass: Record<string, { keys: string[]; chooseN: number | null }> = {};
  const proficiencyParts: string[] = [];
  const featureParts: string[] = [];
  const featureDetails: FeatureDetail[] = [];
  const hitDicePool: HitDicePoolEntry[] = [];
  let hitDice = '';
  let speed = 0;
  let startingEquipmentParsed: { label: string; text: string }[] = [];
  let startingEquipmentLabel = 'Starting Equipment';
  let backgroundEquipmentParsed: { label: string; text: string }[] = [];
  let backgroundEquipmentLabel = 'Equipment';
  let backgroundAbilityScoreOption: DerivedCharacterStats['backgroundAbilityScoreOption'] = null;
  const totalLevel = Math.max(
    1,
    Math.min(
      20,
      classEntries.reduce((sum, c) => sum + Math.max(1, c.level || 1), 0) || 1,
    ),
  );

  // Runs once per class. Everything class-scoped (features by gain level, the hit die, the skill
  // menu) uses THAT class's level; only the initial class contributes saves, the full starting
  // proficiencies and the starting equipment, per the SRD multiclassing rules.
  const deriveClass = (entry: DeriveClassInput, isInitialClass: boolean): void => {
  const classItem = entry.classItem;
  const subclassItem = entry.subclassItem ?? null;
  const currentLevel = Math.max(1, Math.min(20, entry.level || 1));
  const multiclassGrants = isInitialClass
    ? null
    : (readClassMulticlassing(classItem?.normalized)?.grants ?? {});
  const classTag = {
    ...(classItem ? { sourceClassId: classItem.id, sourceClassName: classItem.name } : {}),
    sourceClassLevel: currentLevel,
  };

  if (classItem?.normalized && typeof classItem.normalized === 'object') {
    const norm = classItem.normalized as Record<string, unknown>;

    const hitPoints = (norm.hitPoints ?? norm.hit_points) as
      | { hitDiceName?: string; hit_dice_name?: string }
      | undefined;
    const hitDiceName = hitPoints?.hitDiceName ?? hitPoints?.hit_dice_name;
    if (hitDiceName) {
      const notation = normalizeHitDice(hitDiceName as string);
      if (isInitialClass) hitDice = notation;
      const dieMax = hitDieMaxFromNotation(notation);
      if (dieMax > 0) hitDicePool.push({ dieMax, levels: currentLevel });
    }

    // Multiclassing grants NO saving throw proficiencies: only the initial class does.
    const savingThrowsList = (norm.savingThrows ?? norm.saving_throws) as
      | Array<{ name?: string }>
      | undefined;
    if (isInitialClass && Array.isArray(savingThrowsList)) {
      for (const s of savingThrowsList) {
        const name = s.name as string | undefined;
        if (name && DND_ATTRIBUTES.includes(name)) savingThrows[name] = true;
      }
    }

    type FeatureWithTable = {
      name?: string;
      featureType?: string;
      feature_type?: string;
      gainedAt?: unknown;
      gained_at?: unknown;
      desc?: string;
      key?: string;
      mechanics?: { featureKey?: string };
      dataForClassTable?: Array<{ level?: number; columnValue?: string }>;
      data_for_class_table?: Array<{ level?: number; column_value?: string }>;
    };

    const compactTableRows = (
      rawTable: Array<{ level?: number; columnValue?: string; column_value?: string }>
    ): Array<{ level: number; value: string }> => {
      const rawRows = rawTable.map((row) => {
        const level = Number(row.level ?? 0);
        const value =
          'columnValue' in row && row.columnValue !== undefined
            ? String(row.columnValue).trim()
            : 'column_value' in row && row.column_value !== undefined
              ? String(row.column_value).trim()
              : '';
        return { level, value };
      });
      const sorted = rawRows
        .filter((row) => row.level > 0 && row.value !== '')
        .sort((a, b) => a.level - b.level);
      const compact: Array<{ level: number; value: string }> = [];
      for (const row of sorted) {
        const last = compact[compact.length - 1];
        if (!last || last.value !== row.value) {
          compact.push(row);
        }
      }
      return compact;
    };

    const pushTableData = (
      f: FeatureWithTable,
      tableDataByName: Map<string, Array<{ level: number; value: string }>>,
      tableDataByKey: Map<string, Array<{ level: number; value: string }>>
    ) => {
      const type = (f.featureType ?? f.feature_type ?? '').toUpperCase();
      const hasTable =
        Array.isArray(f.dataForClassTable ?? f.data_for_class_table) &&
        (f.dataForClassTable ?? f.data_for_class_table)!.length > 0;
      const allowedType =
        type === 'CLASS_TABLE_DATA' ||
        type === 'SPELL_SLOTS' ||
        (type === 'CLASS_LEVEL_FEATURE' && hasTable);
      if (!allowedType) return;
      const name = (f.name as string | undefined)?.trim();
      const key = (f.key as string | undefined)?.trim();
      if (!name && !key) return;
      const rawTable =
        f.dataForClassTable ??
        f.data_for_class_table ??
        (null as unknown as Array<{ level?: number; columnValue?: string; column_value?: string }>);
      if (!Array.isArray(rawTable)) return;
      const compact = compactTableRows(rawTable);
      if (compact.length > 0) {
        if (name) tableDataByName.set(name, compact);
        if (key) tableDataByKey.set(key, compact);
      }
    };

    const features = norm.features as FeatureWithTable[] | undefined;
    const rawFeatures = (classItem as { raw?: { features?: unknown[] } }).raw?.features as
      | FeatureWithTable[]
      | undefined;
    const allFeaturesForTables = Array.isArray(features)
      ? Array.isArray(rawFeatures)
        ? [
            ...features,
            ...rawFeatures.filter(
              (rf) => !features.some((f) => (f.key ?? f.name) === (rf.key ?? rf.name))
            ),
          ]
        : features
      : Array.isArray(rawFeatures)
        ? rawFeatures
        : [];

    if (Array.isArray(features) || Array.isArray(rawFeatures)) {
      const tableDataByName = new Map<string, Array<{ level: number; value: string }>>();
      const tableDataByKey = new Map<string, Array<{ level: number; value: string }>>();
      for (const f of allFeaturesForTables) {
        pushTableData(f, tableDataByName, tableDataByKey);
      }

      // Slug index so a column resolves even when its upstream display name is wrong.
      const sourceKey = (classItem.sourceKey ?? '').trim();
      const tableDataBySlug = new Map<string, Array<{ level: number; value: string }>>();
      for (const [key, rows] of tableDataByKey.entries()) {
        const slug = columnKeySlug(key, sourceKey);
        if (slug && !tableDataBySlug.has(slug)) tableDataBySlug.set(slug, rows);
      }

      /** Per-class spellcasting table keys (base = class sourceKey, e.g. srd-2024_bard). */
      const SPELLCASTING_TABLE_KEYS = [
        { keySuffix: 'cantrips', label: 'Cantrips' },
        { keySuffix: 'prepared-spells', label: 'Prepared Spells' },
        { keySuffix: 'slots-1st', label: '1st-level Slots' },
        { keySuffix: 'slots-2nd', label: '2nd-level Slots' },
        { keySuffix: 'slots-3rd', label: '3rd-level Slots' },
        { keySuffix: 'slots-4th', label: '4th-level Slots' },
        { keySuffix: 'slots-5th', label: '5th-level Slots' },
        { keySuffix: 'slots-6th', label: '6th-level Slots' },
        { keySuffix: 'slots-7th', label: '7th-level Slots' },
        { keySuffix: 'slots-8th', label: '8th-level Slots' },
        { keySuffix: 'slots-9th', label: '9th-level Slots' },
      ];

      const allClassFeatures = features ?? [];
      const metamagicOptionsFeature = allClassFeatures.find((f) => {
        const type = (f.featureType ?? f.feature_type ?? '').toUpperCase();
        const name = (f.name ?? '').trim().toLowerCase();
        const key = (f.key ?? '').trim().toLowerCase();
        return (
          type === 'CLASS_FEATURE_OPTION_LIST' &&
          (name === 'metamagic options' || key.includes('metamagic-options'))
        );
      });
      const metamagicOptions = parseMetamagicOptions(
        typeof metamagicOptionsFeature?.desc === 'string' ? metamagicOptionsFeature.desc : ''
      );

      const eldritchInvocationOptionsFeature = allClassFeatures.find((f) => {
        const type = (f.featureType ?? f.feature_type ?? '').toUpperCase();
        const name = (f.name ?? '').trim().toLowerCase();
        const key = (f.key ?? '').trim().toLowerCase();
        return (
          type === 'CLASS_FEATURE_OPTION_LIST' &&
          (name === 'eldritch invocation options' ||
            name === 'eldritch invocations options' ||
            key.includes('eldritch-invocation-options') ||
            key.includes('eldritch_invocation_options'))
        );
      });
      const eldritchInvocationOptions = parseEldritchInvocationOptions(
        typeof eldritchInvocationOptionsFeature?.desc === 'string'
          ? eldritchInvocationOptionsFeature.desc
          : ''
      );

      // `[Column data]` is a pure class-table column mistyped upstream as a feature
      // (Druid "Cantrips Known" = the Wild Shape column); don't render it as a feature.
      const levelFeatures = allClassFeatures.filter(
        (f) =>
          (f.featureType ?? f.feature_type ?? '').toUpperCase() === 'CLASS_LEVEL_FEATURE' &&
          (typeof f.desc === 'string' ? f.desc.trim() : '') !== '[Column data]'
      );
      for (const f of levelFeatures) {
        const gainedAt = f.gainedAt ?? f.gained_at;
        const structuredLevels = getGainedAtLevels({ gained_at: gainedAt } as { gained_at?: unknown });
        // Merge any "gained again at level N" levels the structured data missed (see helper).
        const repeatLevels = parseRepeatGainLevelsFromDesc(
          typeof f.desc === 'string' ? f.desc : '',
          typeof f.name === 'string' ? f.name : ''
        );
        const levels = Array.from(new Set([...structuredLevels, ...repeatLevels])).sort(
          (a, b) => a - b
        );
        const entriesAtOrBefore = getGainedAtEntriesAtOrBefore(gainedAt, currentLevel);
        const levelsAtOrBefore =
          levels.length === 0
            ? []
            : [...levels].filter((lvl) => lvl <= currentLevel).sort((a, b) => a - b);
        const gainCount = levels.length === 0 ? 1 : levelsAtOrBefore.length;
        const hasAtOrBeforeLevel = gainCount > 0;
        if (hasAtOrBeforeLevel && f.name) {
          const name = f.name as string;
          const rawDesc = typeof f.desc === 'string' ? f.desc : '';
          const desc = name.trim().toLowerCase().includes('spell list')
            ? normalizeFeatureDesc(normalizeSpellListLevelHeadings(rawDesc))
            : normalizeFeatureDesc(rawDesc);
          const baseDetail: FeatureDetail = {
            name,
            desc,
            source: 'class',
            gainCount,
            ...(f.mechanics?.featureKey ? { featureKey: f.mechanics.featureKey } : {}),
          };
          if (levelsAtOrBefore.length > 0) {
            baseDetail.gainedAtLevels = levelsAtOrBefore;
            if (entriesAtOrBefore.length > 0) {
              const detailByLevel = new Map(
                entriesAtOrBefore.map((e) => [e.level, e.detail as string | undefined])
              );
              const aligned = levelsAtOrBefore.map((lvl) => detailByLevel.get(lvl));
              if (aligned.some((d) => d != null && String(d).trim() !== '')) {
                baseDetail.gainedAtDetails = aligned.map((d) => (d != null ? d : ''));
              }
            }
          }
          /** Only fills options for known "single-choice" features (e.g. Blessed Strikes, Divine Order, Elemental Fury, Primal Order). */
          const SINGLE_CHOICE_CLASS_FEATURES = [
            'blessed strikes',
            'divine order',
            'improved blessed strikes',
            'elemental fury',
            'improved elemental fury',
            'primal order',
            'fighting style',
          ];
          const nameLower = name.trim().toLowerCase();
          if (SINGLE_CHOICE_CLASS_FEATURES.some((n) => nameLower === n)) {
            const traitOpts = parseTraitOptions(rawDesc);
            // Some features have only 1 textual option (e.g. Paladin Fighting Style -> Blessed Warrior).
            const minOpts = nameLower === 'fighting style' ? 1 : 2;
            if (traitOpts.length >= minOpts) {
              baseDetail.options = traitOpts;
            }
          }
          if (nameLower === 'metamagic') {
            const traitOpts =
              metamagicOptions.length >= 2 ? metamagicOptions : parseTraitOptions(rawDesc);
            if (traitOpts.length >= 2) {
              baseDetail.options = traitOpts;
            }
          }
          if (isEldritchInvocationsFeature(baseDetail)) {
            const traitOpts =
              eldritchInvocationOptions.length >= 1
                ? eldritchInvocationOptions
                : parseTraitOptions(rawDesc);
            if (traitOpts.length >= 1) {
              baseDetail.options = traitOpts;
            }
          }
          if (nameLower === 'skillful' && allSkillOptions && allSkillOptions.length > 0) {
            baseDetail.options = allSkillOptions;
          }
          const tables: Array<{ label: string; rows: Array<{ level: number; value: string }> }> =
            [];
          // Spellcasting / Pact Magic keep bespoke logic (multi-column slot grids);
          // every other column table is resolved generically in the `else` branch.
          if (name.trim().toLowerCase().includes('spellcasting')) {
            const baseKey = (classItem.sourceKey ?? '').trim();
            if (baseKey) {
              for (const { keySuffix, label } of SPELLCASTING_TABLE_KEYS) {
                const keyWithDash = `${baseKey}_${keySuffix}`;
                const keyWithUnderscore = `${baseKey}_${keySuffix.replace(/-/g, '_')}`;
                const rows =
                  tableDataByKey.get(keyWithDash) ?? tableDataByKey.get(keyWithUnderscore);
                if (rows && rows.length > 0) {
                  tables.push({ label, rows });
                }
              }
            }
            if (tables.length === 0) {
              const tableRows = tableDataByName.get(name);
              if (tableRows && tableRows.length > 0) {
                tables.push({ label: name, rows: tableRows });
              }
            }
            if (tables.length > 0) {
              baseDetail.desc = injectSpellcastingTablePlaceholders(
                baseDetail.desc,
                tables.map((t) => t.label)
              );
            }
          } else if (
            name.trim().toLowerCase().includes('pact') &&
            name.trim().toLowerCase().includes('magic')
          ) {
            // Warlock: Pact Magic may have tables with labels different from spellcasting.
            // Here we do a tolerant match by label.
            for (const [tableLabel, rows] of tableDataByName.entries()) {
              const tl = tableLabel.trim().toLowerCase();
              if (tl.includes('pact') && tl.includes('magic')) {
                tables.push({ label: tableLabel, rows });
              }
            }
            // Fallback: "pact" + "slot"
            if (tables.length === 0) {
              for (const [tableLabel, rows] of tableDataByName.entries()) {
                const tl = tableLabel.trim().toLowerCase();
                if (tl.includes('pact') && tl.includes('slot')) {
                  tables.push({ label: tableLabel, rows });
                }
              }
            }
            // Final fallback: any table with "slot" (so it isn't left without UI)
            if (tables.length === 0) {
              for (const [tableLabel, rows] of tableDataByName.entries()) {
                const tl = tableLabel.trim().toLowerCase();
                if (tl.includes('slot')) {
                  tables.push({ label: tableLabel, rows });
                }
              }
            }

            // Warlock also has Cantrips (e.g. Eldritch Blast). The modal only renders
            // the table when the label is exactly "Cantrips".
            const cantripsRow = (() => {
              for (const [tableLabel, rows] of tableDataByName.entries()) {
                const tl = tableLabel.trim().toLowerCase();
                if (tl.includes('cantrips')) {
                  return { rows };
                }
              }
              return null;
            })();
            if (cantripsRow && !tables.some((t) => t.label.trim().toLowerCase() === 'cantrips')) {
              tables.push({ label: 'Cantrips', rows: cantripsRow.rows });
            }

            // If the backend brings any "Prepared Spells" section for Pact Magic,
            // the modal looks for the label exactly "Prepared Spells".
            const preparedRow = (() => {
              for (const [tableLabel, rows] of tableDataByName.entries()) {
                const tl = tableLabel.trim().toLowerCase();
                if (tl.includes('prepared spells')) {
                  return { rows };
                }
              }
              return null;
            })();
            if (
              preparedRow &&
              !tables.some((t) => t.label.trim().toLowerCase() === 'prepared spells')
            ) {
              tables.push({ label: 'Prepared Spells', rows: preparedRow.rows });
            }

            if (tables.length > 1) {
              const seen = new Set<string>();
              const dedup: Array<{ label: string; rows: Array<{ level: number; value: string }> }> =
                [];
              for (const t of tables) {
                const key = t.label.trim().toLowerCase();
                if (seen.has(key)) continue;
                seen.add(key);
                dedup.push(t);
              }
              tables.splice(0, tables.length, ...dedup);
            }

            // Insert placeholders similar to the Spellcasting flow to position tables in the markdown,
            // when the text contains the expected markers.
            if (tables.length > 0) {
              baseDetail.desc = injectSpellcastingTablePlaceholders(
                baseDetail.desc,
                tables.map((t) => t.label)
              );
            }
          } else {
            // Attach each column the description references; label is the referenced
            // name so the renderer can stitch it in at that paragraph.
            for (const columnName of extractColumnReferences(baseDetail.desc)) {
              const rows =
                tableDataByName.get(columnName) ?? tableDataBySlug.get(columnSlug(columnName));
              if (rows && rows.length > 0 && !tables.some((t) => t.label === columnName)) {
                tables.push({ label: columnName, rows });
              }
            }

            // No prose reference (e.g. Unarmored Movement): append its own same-named table.
            if (tables.length === 0) {
              let tableRows = tableDataByName.get(name);
              if ((!tableRows || tableRows.length === 0) && isUnarmoredMovementFeatureName(name)) {
                for (const [tableName, rows] of tableDataByName.entries()) {
                  if (isUnarmoredMovementFeatureName(tableName)) {
                    tableRows = rows;
                    break;
                  }
                }
              }
              if (tableRows && tableRows.length > 0) {
                tables.push({ label: name, rows: tableRows });
              }
            }
          }
          featureParts.push(name);
          featureDetails.push(
            tables.length > 0
              ? { ...baseDetail, tableData: tables, ...classTag }
              : { ...baseDetail, ...classTag }
          );
        }
      }
    }

    const coreTraitsKey = `${classItem.sourceKey ?? ''}_core-traits`;
    const featuresList = features ?? [];
    const core =
      Array.isArray(featuresList) &&
      (featuresList.find((f: { key?: string }) => f.key === coreTraitsKey) ??
        featuresList.find((f: { key?: string }) => (f.key ?? '').endsWith('_core-traits')));
    const coreDesc =
      core && typeof (core as { desc?: string }).desc === 'string'
        ? (core as { desc: string }).desc
        : undefined;
    const coreMap = parseTableLikeToMap(coreDesc);

    // A class joined by multiclassing grants only the subset in `normalized.multiclassing.grants`.
    // Both paths emit the same "Label: value" lines, so downstream parsing is identical.
    const classSkillText = multiclassGrants
      ? multiclassSkillChoiceText(multiclassGrants.skillChoice, coreMap['Skill Proficiencies'])
      : coreMap['Skill Proficiencies'];
    if (classSkillText) {
      proficiencyParts.push(`Skills: ${classSkillText}`);
      const parsed = parseSkillProficienciesText(classSkillText);
      if (classItem) classSkillOptionsByClass[classItem.id] = parsed;
      if (isInitialClass) classSkillOptions = parsed;
    }
    const weaponProf = multiclassGrants
      ? multiclassGrants.weaponProficiencies
      : coreMap['Weapon Proficiencies'];
    if (weaponProf) {
      proficiencyParts.push(`Weapon Proficiencies: ${weaponProf}`);
    }
    const armorProf = multiclassGrants ? multiclassGrants.armorTraining : coreMap['Armor Training'];
    if (armorProf) {
      proficiencyParts.push(`Armor Training: ${armorProf}`);
    }
    const toolProf = multiclassGrants
      ? multiclassGrants.toolProficiencies
      : (coreMap['Tool Proficiencies'] ?? coreMap['Tool Proficiency']);
    if (toolProf) {
      proficiencyParts.push(`Tool Proficiencies: ${toolProf}`);
    }

    // Starting equipment comes from the initial class only; multiclassing grants none.
    if (isInitialClass) {
      const startingEquipmentKey =
        coreMap['Starting Equipment'] !== undefined
          ? 'Starting Equipment'
          : coreMap['Starting equipment'] !== undefined
            ? 'Starting equipment'
            : null;
      if (startingEquipmentKey) startingEquipmentLabel = startingEquipmentKey;
      const startingEquipmentRaw =
        coreMap['Starting Equipment'] ??
        coreMap['Starting equipment'] ??
        norm.startingEquipment ??
        (norm as Record<string, unknown>).starting_equipment;
      const startingEquipmentStr =
        typeof startingEquipmentRaw === 'string'
          ? startingEquipmentRaw
          : typeof startingEquipmentRaw === 'object' &&
              startingEquipmentRaw !== null &&
              'desc' in startingEquipmentRaw
            ? String((startingEquipmentRaw as { desc?: string }).desc ?? '')
            : '';
      startingEquipmentParsed = parseStartingEquipmentOptions(startingEquipmentStr);
    }

    if (isInitialClass && proficiencyParts.length === 0) {
      const sp = (norm.skillProficiencies ?? norm.skill_proficiencies) as string | undefined;
      const wp = (norm.weaponProficiencies ?? norm.weapon_proficiencies) as string | undefined;
      const ap = (norm.armorProficiencies ?? norm.armor_proficiencies ?? norm.armor_training) as
        | string
        | undefined;
      const tp = (norm.toolProficiencies ?? norm.tool_proficiencies) as string | undefined;
      if (sp) {
        proficiencyParts.push(`Skills: ${sp}`);
        classSkillOptions = parseSkillProficienciesText(sp);
      }
      if (wp) proficiencyParts.push(`Weapon Proficiencies: ${wp}`);
      if (ap) proficiencyParts.push(`Armor Training: ${ap}`);
      if (tp) proficiencyParts.push(`Tool Proficiencies: ${tp}`);
    }
  }

  if (subclassItem?.normalized && typeof subclassItem.normalized === 'object') {
    const norm = subclassItem.normalized as Record<string, unknown>;
    const features = norm.features as
      | Array<{
          name?: string;
          desc?: string;
          featureType?: string;
          feature_type?: string;
          gainedAt?: unknown;
          gained_at?: unknown;
          mechanics?: { featureKey?: string };
        }>
      | undefined;
    if (Array.isArray(features)) {
      // Data comes in alphabetical order; display by gain level like class features.
      const gained: Array<{ detail: FeatureDetail; firstLevel: number }> = [];
      for (const f of features) {
        const type = (f.featureType ?? f.feature_type ?? '').toUpperCase();
        if (type !== 'CLASS_LEVEL_FEATURE' || !f.name) continue;
        const rawDesc = typeof f.desc === 'string' ? f.desc : '';
        if (rawDesc.trim() === '[Column data]') continue;
        const gainedAt = f.gainedAt ?? f.gained_at;
        const levels = getGainedAtLevels({ gained_at: gainedAt } as { gained_at?: unknown });
        const levelsAtOrBefore = levels.filter((lvl) => lvl <= currentLevel).sort((a, b) => a - b);
        // Without structured gainedAt, treat as gained at the subclass unlock level (3).
        if (levels.length > 0 ? levelsAtOrBefore.length === 0 : currentLevel < 3) continue;
        // Choice options: "**Name.** ..." blocks (Hunter's Prey, Defensive Tactics) only when the
        // text announces the choice, otherwise features with bold paragraphs would become fake options;
        // Elemental Affinity / Fiendish Resilience / Circle of the Land have name-only options.
        const traitOpts = subclassFeatureHasTraitOptionChoice(rawDesc)
          ? parseTraitOptions(rawDesc)
          : [];
        const simpleOpts = getSubclassSimpleOptions(f.name, rawDesc);
        const opts = traitOpts.length >= 2 ? traitOpts : simpleOpts;
        gained.push({
          firstLevel: levelsAtOrBefore[0] ?? 3,
          detail: {
            name: f.name,
            desc: normalizeFeatureDesc(rawDesc),
            source: 'subclass',
            gainCount: levels.length === 0 ? 1 : levelsAtOrBefore.length,
            ...(levelsAtOrBefore.length > 0 ? { gainedAtLevels: levelsAtOrBefore } : {}),
            ...(f.mechanics?.featureKey ? { featureKey: f.mechanics.featureKey } : {}),
            ...(opts.length >= 2 ? { options: opts } : {}),
          },
        });
      }
      gained.sort((a, b) => a.firstLevel - b.firstLevel);
      for (const { detail } of gained) {
        featureParts.push(detail.name);
        featureDetails.push({ ...detail, ...classTag });
      }
    }
  }
  };

  classEntries.forEach((entry, index) => deriveClass(entry, index === 0));

  if (raceItem?.normalized && typeof raceItem.normalized === 'object') {
    const norm = raceItem.normalized as Record<string, unknown>;
    const traits = norm.traits as
      | Array<{ name?: string; desc?: string; mechanics?: { featureKey?: string } }>
      | undefined;
    if (Array.isArray(traits)) {
      const speedTrait = traits.find((t) => (t.name ?? '').toLowerCase() === 'speed');
      if (speedTrait && (speedTrait.desc || speedTrait.name)) {
        const speedSource = (speedTrait.desc as string) ?? (speedTrait.name as string) ?? '';
        speed = parseSpeedToNumber(speedSource);
      }
      if (speed === 0) {
        const speedStr = norm.speed as string | undefined;
        if (speedStr) speed = parseSpeedToNumber(speedStr);
      }
      for (const t of traits) {
        if (t.name) {
          const rawDesc = typeof t.desc === 'string' ? t.desc : '';
          const traitTitle = t.name as string;
          let opts = isSelectableTrait(traitTitle) ? parseTraitOptions(rawDesc) : undefined;
          if (traitTitle.trim().toLowerCase() === 'keen senses') {
            const keenOpts = parseKeenSensesSkillOptions(rawDesc);
            if (keenOpts.length > 0) opts = keenOpts;
          }
          const skillful = traitTitle.trim().toLowerCase() === 'skillful';
          if (skillful && allSkillOptions && allSkillOptions.length > 0) {
            opts = allSkillOptions;
          }
          const keenSenses = traitTitle.trim().toLowerCase() === 'keen senses';
          const includeOpts =
            opts &&
            (opts.length >= 2 ||
              (keenSenses && opts.length === 1) ||
              (skillful && opts.length >= 1));
          featureParts.push(traitTitle);
          const descForTrait = isSelectableTrait(traitTitle)
            ? rawDesc.replace(/^\*{0,2}Table:\s*[^\n]*\*{0,2}$/gm, '').replace(/\n{3,}/g, '\n\n').trim()
            : rawDesc;
          featureDetails.push({
            name: traitTitle,
            desc: normalizeFeatureDesc(descForTrait),
            source: 'race',
            ...(t.mechanics?.featureKey ? { featureKey: t.mechanics.featureKey } : {}),
            ...(includeOpts ? { options: opts } : {}),
          });
        }
      }
    } else {
      const speedStr = norm.speed as string | undefined;
      if (speedStr) speed = parseSpeedToNumber(speedStr);
    }
  }

  if (backgroundItem?.normalized && typeof backgroundItem.normalized === 'object') {
    const norm = backgroundItem.normalized as Record<string, unknown>;
    const benefits = norm.benefits as
      | Array<{ type?: string; name?: string; desc?: string }>
      | undefined;
    if (Array.isArray(benefits)) {
      const toolBenefit = benefits.find((b) => (b.type ?? '').toLowerCase() === 'tool_proficiency');
      if (toolBenefit) {
        const desc = (toolBenefit.desc as string) ?? (toolBenefit.name as string) ?? '';
        if (desc.trim()) proficiencyParts.push(`Tool Proficiencies: ${desc.trim()}`);
      }
      const skillBenefit = benefits.find(
        (b) => (b.type ?? '').toLowerCase() === 'skill_proficiency'
      );
      if (skillBenefit) {
        const desc = (skillBenefit.desc as string) ?? (skillBenefit.name as string) ?? '';
        const { keys, chooseN } = parseSkillProficienciesText(desc);
        const toSelect = chooseN != null ? keys.slice(0, chooseN) : keys;
        for (const key of toSelect) {
          skillProficiencies[key] = true;
        }
      }
      const equipmentBenefit = benefits.find((b) => (b.type ?? '').toLowerCase() === 'equipment');
      if (equipmentBenefit) {
        const name = (equipmentBenefit.name as string) ?? 'Equipment';
        const desc = (equipmentBenefit.desc as string) ?? '';
        backgroundEquipmentLabel = name.trim() || 'Equipment';
        const opts = parseStartingEquipmentOptions(desc);
        if (opts.length > 0) {
          backgroundEquipmentParsed = opts;
        }
      }
      const abilityScoreBenefit = benefits.find(
        (b) => (b.type ?? '').toLowerCase() === 'ability_score'
      );
      if (abilityScoreBenefit) {
        const desc = ((abilityScoreBenefit.desc ?? abilityScoreBenefit.name) as string) ?? '';
        const pointsMatch = desc.match(/(\d+)\s*points?/i);
        const totalPoints = pointsMatch
          ? Math.min(6, Math.max(1, parseInt(pointsMatch[1], 10)))
          : 3;
        const maxPerAbility = 2;
        const allowedAbilityNames = parseAllowedAbilityNamesFromDesc(desc);
        backgroundAbilityScoreOption = {
          totalPoints,
          maxPerAbility,
          allowedAbilityNames:
            allowedAbilityNames.length > 0 ? allowedAbilityNames : [...DND_ATTRIBUTES],
        };
      }
      // Feat(s) granted by background: add to featureDetails for "Habilidades e traços"
      const featBenefits = benefits.filter((b) => (b.type ?? '').toLowerCase() === 'feat');
      for (const fb of featBenefits) {
        const featName = ((fb.desc ?? fb.name) as string)?.trim() || 'Feat';
        let featDesc = '';
        if (Array.isArray(feats) && feats.length > 0) {
          const featNameLower = featName.toLowerCase();
          const featNameSlug = featNameLower
            .replace(/\s*\([^)]*\)\s*/g, ' ')
            .trim()
            .replace(/\s+/g, '-');
          const matched = feats.find((f) => {
            const fName = (f.name ?? '').toLowerCase();
            const fKey = (f.sourceKey ?? '').toLowerCase();
            if (fName === featNameLower) return true;
            if (fKey.endsWith(featNameSlug) || fKey.includes(featNameSlug)) return true;
            const fNameBase = fName.replace(/\s*\([^)]*\)\s*/g, ' ').trim();
            const featNameBase = featNameLower.replace(/\s*\([^)]*\)\s*/g, ' ').trim();
            return fNameBase === featNameBase;
          });
          if (matched) featDesc = getFeatDescription(matched);
        }
        const finalDesc = featDesc || ((fb.desc ?? fb.name) as string | undefined) || '';
        featureDetails.push({
          name: featName,
          desc: normalizeFeatureDesc(finalDesc),
          source: 'background',
        });
        featureParts.push(featName);
      }
    }
  }

  const mergedProficiencyParts = mergeProficiencyLines(proficiencyParts);
  const proficiencies = mergedProficiencyParts.join('\n');
  const features = featureParts.join('\n');

  // Disciplined Survivor: proficiency in all saving throws
  const hasDisciplinedSurvivor = featureDetails.some(
    (f) => f.name.trim().toLowerCase() === 'disciplined survivor'
  );
  if (hasDisciplinedSurvivor) {
    for (const attr of DND_ATTRIBUTES) {
      savingThrows[attr] = true;
    }
  }

  // Slippery Mind (e.g. Rogue 15): proficiency in Wisdom and Charisma saving throws
  const hasSlipperyMind = featureDetails.some(
    (f) => f.name.trim().toLowerCase() === 'slippery mind'
  );
  if (hasSlipperyMind) {
    savingThrows.Wisdom = true;
    savingThrows.Charisma = true;
  }

  // Partition the character-wide by-gain arrays between the classes that granted the same feature.
  // Generic on purpose (keyed by name, in derivation order): any per-gain feature two classes can
  // grant needs this, not just Ability Score Improvement.
  {
    const usedByName = new Map<string, number>();
    for (const f of featureDetails) {
      if (f.source !== 'class') continue;
      const key = f.name.trim().toLowerCase();
      const offset = usedByName.get(key) ?? 0;
      f.gainSlotOffset = offset;
      usedByName.set(key, offset + (f.gainCount ?? 1));
    }
  }

  const startingEquipmentOptions =
    startingEquipmentParsed.length > 0
      ? { label: startingEquipmentLabel, options: startingEquipmentParsed }
      : null;
  const backgroundEquipmentOptions =
    backgroundEquipmentParsed.length > 0
      ? { label: backgroundEquipmentLabel, options: backgroundEquipmentParsed }
      : null;

  return {
    hitDice,
    hitDicePool,
    speed,
    proficiencies,
    features,
    featureDetails,
    savingThrows,
    skillProficiencies,
    classSkillOptions,
    classSkillOptionsByClass,
    startingEquipmentOptions,
    backgroundEquipmentOptions,
    backgroundAbilityScoreOption,
    totalLevel,
  };
}

function normalizeAlertName(name: string): string {
  return (name ?? '').trim().toLowerCase().replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
}

function hasAlertFeatInFeatures(data: CharacterFormData, featsList?: RuleItemResponse[]): boolean {
  if ((data.featureDetails ?? []).some((f) => normalizeAlertName(f.name) === 'alert')) return true;
  if (!featsList?.length) return false;
  const isAlertId = (id: string | null | undefined): boolean => {
    if (!id) return false;
    const feat = featsList.find((f) => f.id === id);
    return feat ? normalizeAlertName(feat.name) === 'alert' : false;
  };
  if (isAlertId(data.versatileFeatId)) return true;
  if (isAlertId(data.epicBoonFeatId)) return true;
  return (data.abilityScoreImprovementByGain ?? []).some(
    (g) => g?.kind === 'feat' && isAlertId(g.featId),
  );
}

/**
 * Recomputes combat fields (AC, max/current HP, initiative) from the character's
 * current attributes and hit die. Uses `getEffectiveModifier`, so not-yet-selected
 * attributes contribute as 0.
 *
 * `options.fillCurrentHpToMax` seeds currentHp to the freshly computed maxHp instead of preserving
 * the stored value: creation always starts a character at full health, whereas play preserves
 * currentHp (damage/healing is tracked there).
 */
export function applyCombatFromAttributes(
  data: CharacterFormData,
  featsList?: RuleItemResponse[],
  options?: { fillCurrentHpToMax?: boolean },
): CharacterFormData {
  let working: CharacterFormData = data;
  if (!canApplyAbilityScoreImprovementASI(working)) {
    const byGain = working.abilityScoreImprovementByGain ?? [];
    if (byGain.some((g) => g?.kind === 'increase_scores' && sumIncreaseScoresInGain(g) > 0)) {
      working = {
        ...working,
        abilityScoreImprovementByGain: byGain.map((g) =>
          g?.kind === 'increase_scores' && sumIncreaseScoresInGain(g) > 0 ? null : g
        ),
      };
    }
  }

  const { hasPrimalChampion, hasBodyAndMind } = getPrimalChampionBodyAndMindBonusFlags(working);
  /** PHB / SRD: +1 to max HP per character level. */
  const hasDwarvenToughness = (working.featureDetails ?? []).some(
    (f) => f.name.trim().toLowerCase() === 'dwarven toughness'
  );
  // Draconic Resilience: +3 at level 3 and +1 per Sorcerer level after = +1 per SORCERER level.
  // Scoped to its own class, so a Sorcerer 3 / Fighter 5 gets +3, not +8.
  const draconicResilienceFeature = (working.featureDetails ?? []).find(
    (f) => f.source === 'subclass' && isDraconicResilienceFeatureName(f.name)
  );
  const asiMerged = getTotalAbilityScoreImprovementFromGains(working.abilityScoreImprovementByGain);
  const combinedBonus: Record<string, number> = {};
  for (const k of new Set([
    ...Object.keys(working.backgroundAbilityScoreIncrease ?? {}),
    ...Object.keys(asiMerged),
  ])) {
    combinedBonus[k] =
      ((working.backgroundAbilityScoreIncrease ?? {})[k] ?? 0) + (asiMerged[k] ?? 0);
  }
  const epicBoonForMods = getEffectiveEpicBoonAbilityScore(working);
  const dexMod = getEffectiveModifier(
    working.attributes ?? {},
    combinedBonus,
    'Dexterity',
    epicBoonForMods,
    hasPrimalChampion,
    hasBodyAndMind,
    working.grapplerAbilityScore
  );
  const conMod = getEffectiveModifier(
    working.attributes ?? {},
    combinedBonus,
    'Constitution',
    epicBoonForMods,
    hasPrimalChampion,
    hasBodyAndMind,
    working.grapplerAbilityScore
  );
  const level = Math.max(1, Math.min(20, working.level ?? 1));
  // Falls back to the single derived notation for data that predates the per-class pool.
  const hitDicePool =
    working.hitDicePool && working.hitDicePool.length > 0
      ? working.hitDicePool.map((p) => ({ dieMax: p.dieMax, levels: p.levels }))
      : hitDieMaxFromNotation(working.hitDice || '') > 0
        ? [{ dieMax: hitDieMaxFromNotation(working.hitDice || ''), levels: level }]
        : [];
  const draconicClassIndex = draconicResilienceFeature
    ? (working.classes ?? []).findIndex(
        (c) => c.classRuleItemId === draconicResilienceFeature.sourceClassId
      )
    : -1;
  // Detection (which features apply) lives here; the arithmetic is the shared recomputeCombatStats,
  // so the backend recompute produces byte-identical maxHp / base AC / initiative from the same fn.
  const combat = recomputeCombatStats({
    level,
    dexMod,
    conMod,
    hitDicePool,
    hasClass: hitDicePool.length > 0,
    // Each +1-HP-per-level feature contributes 1; the shared formula multiplies by level.
    bonusHpPerLevel: hasDwarvenToughness ? 1 : 0,
    bonusHpPerClassLevel: draconicResilienceFeature
      ? [{ classIndex: draconicClassIndex >= 0 ? draconicClassIndex : 0, perLevel: 1 }]
      : [],
    hasAlert: hasAlertFeatInFeatures(working, featsList),
    // undefined lets recomputeCombatStats seed currentHp to maxHp (full health on creation).
    previousCurrentHp: options?.fillCurrentHpToMax ? undefined : working.currentHp,
  });

  return {
    ...working,
    armorClass: combat.baseArmorClass,
    maxHp: combat.maxHp,
    currentHp: combat.currentHp,
    initiative: combat.initiative,
  };
}

/** Project the stored per-gain ASI choices onto exactly `gainCount` slots. */
function abilityScoreImprovementByGainForCount(
  data: CharacterFormData,
  gainCount: number
): AbilityScoreImprovementGainChoice[] {
  const out: AbilityScoreImprovementGainChoice[] = Array.from({ length: gainCount }, () => null);
  const existing = data.abilityScoreImprovementByGain;
  if (existing && existing.length > 0) {
    for (let i = 0; i < gainCount; i++) {
      out[i] = existing[i] ?? null;
    }
  }
  return out;
}

/** Per-gain clamp: ≤2 points per slot, global cap per ability. */
function clampAbilityScoreImprovementByGain(
  byGain: AbilityScoreImprovementGainChoice[] | undefined,
  gainCount: number,
  data: CharacterFormData
): AbilityScoreImprovementGainChoice[] {
  const arr: AbilityScoreImprovementGainChoice[] = [];
  for (let i = 0; i < gainCount; i++) {
    arr.push(byGain?.[i] ?? null);
  }
  for (let i = 0; i < gainCount; i++) {
    const c = arr[i];
    if (c?.kind === 'feat') {
      if (!c.featId?.trim()) arr[i] = null;
      continue;
    }
    if (!c || c.kind !== 'increase_scores') continue;
    const m: Record<string, number> = { ...c.byAbility };
    for (const a of DND_ATTRIBUTES) {
      m[a] = Math.max(0, Math.min(m[a] ?? 0, 2));
    }
    let sum = DND_ATTRIBUTES.reduce((s, a) => s + (m[a] ?? 0), 0);
    while (sum > 2) {
      const taker = [...DND_ATTRIBUTES].reverse().find((a) => (m[a] ?? 0) > 0);
      if (!taker) break;
      m[taker] = (m[taker] ?? 0) - 1;
      sum -= 1;
    }
    arr[i] = sum === 0 ? null : { kind: 'increase_scores', byAbility: m };
  }
  for (const a of DND_ATTRIBUTES) {
    const cap = maxAsiBonusForAttribute(data, a);
    let total = arr.reduce((s, g) => {
      if (g?.kind === 'increase_scores') return s + (g.byAbility[a] ?? 0);
      return s;
    }, 0);
    while (total > cap) {
      let reduced = false;
      for (let i = arr.length - 1; i >= 0 && total > cap; i--) {
        const g = arr[i];
        if (g?.kind !== 'increase_scores') continue;
        const cur = g.byAbility[a] ?? 0;
        if (cur <= 0) continue;
        const nextMap = { ...g.byAbility, [a]: cur - 1 };
        const nextSum = DND_ATTRIBUTES.reduce((s, x) => s + (nextMap[x] ?? 0), 0);
        arr[i] = nextSum === 0 ? null : { kind: 'increase_scores', byAbility: nextMap };
        total -= 1;
        reduced = true;
        break;
      }
      if (!reduced) break;
    }
  }
  for (let i = 0; i < gainCount; i++) {
    const c = arr[i];
    if (c?.kind !== 'increase_scores') continue;
    const m = { ...c.byAbility };
    let sum = DND_ATTRIBUTES.reduce((s, a) => s + (m[a] ?? 0), 0);
    while (sum > 2) {
      const taker = [...DND_ATTRIBUTES].reverse().find((x) => (m[x] ?? 0) > 0);
      if (!taker) break;
      m[taker] = (m[taker] ?? 0) - 1;
      sum -= 1;
    }
    arr[i] = sum === 0 ? null : { kind: 'increase_scores', byAbility: m };
  }
  return arr;
}


export function applyDerivedToCharacterData(
  data: CharacterFormData,
  derived: DerivedCharacterStats,
  featsList?: RuleItemResponse[],
  /**
   * True when the character's class just changed. Class-feature selections are then dropped even if
   * the new class happens to share the feature (e.g. Weapon Mastery on Barbarian → Fighter) — the
   * code identifies them by `source: 'class'`, so no per-field list is hardcoded.
   */
  classChanged = false,
): CharacterFormData {
  // Merge: derived initializes all skills to false (complete map), data overrides with saved selections.
  // Background skills from derived are always enforced as true.
  const backgroundSkillKeys = Object.keys(derived.skillProficiencies).filter(
    (k) => derived.skillProficiencies[k]
  );
  const skillProficiencies = { ...derived.skillProficiencies, ...data.skillProficiencies };

  const classKeys = derived.classSkillOptions?.keys ?? [];
  const chooseN = derived.classSkillOptions?.chooseN ?? (classKeys.length || 999);

  // Validate the persisted class skill picks against the current class options.
  const classSkillProficiencyKeys = (data.classSkillProficiencyKeys ?? [])
    .filter((k) => classKeys.length === 0 || classKeys.includes(k))
    .filter((k) => !backgroundSkillKeys.includes(k))
    .slice(0, chooseN);

  // Drop grants whose SOURCE is gone: swapping the background (or the class, which invalidates picks
  // outside the new list) leaves `data.skillProficiencies[k] === true` with nothing granting it, and
  // the spread above would carry that stale true forever. Only the two provenance fields this function
  // itself writes are cleared, and never a key another source still grants (race traits, Primal
  // Knowledge, Bonus Proficiencies, the Skilled feat), so this cannot revoke someone else's skill.
  const grantedByOtherSources = new Set<string>([
    ...getBonusClassSkillBudgetExemptKeys(data),
    ...(data.skilledProficiencyChoices ?? [])
      .filter((c) => c.startsWith('skill:'))
      .map((c) => c.slice('skill:'.length)),
  ]);
  for (const k of data.backgroundSkillKeys ?? []) {
    if (!backgroundSkillKeys.includes(k) && !grantedByOtherSources.has(k)) {
      skillProficiencies[k] = false;
    }
  }
  for (const k of data.classSkillProficiencyKeys ?? []) {
    if (!classSkillProficiencyKeys.includes(k) && !grantedByOtherSources.has(k)) {
      skillProficiencies[k] = false;
    }
  }

  for (const k of backgroundSkillKeys) {
    skillProficiencies[k] = true;
  }
  for (const k of classSkillProficiencyKeys) skillProficiencies[k] = true;

  // Apply Skilled feat picks: skill:* entries mark skills as proficient.
  for (const choice of data.skilledProficiencyChoices ?? []) {
    if (choice.startsWith('skill:')) {
      const key = choice.slice('skill:'.length);
      if (key) skillProficiencies[key] = true;
    }
  }

  const speedStr = derived.speed != null && derived.speed > 0 ? String(derived.speed) : '';

  const prevClassOptions = data.startingEquipmentOptions?.options ?? [];
  const nextClassOptions = derived.startingEquipmentOptions?.options ?? [];
  // Only treat as "changed" when there were previous options — empty prev means initial
  // load/derivation (not a real class change), so we preserve the persisted index.
  const classOptionsChanged =
    prevClassOptions.length > 0 &&
    !areStartingEquipmentParsedOptionsEquivalent(prevClassOptions, nextClassOptions);
  const prevBackgroundOptions = data.backgroundEquipmentOptions?.options ?? [];
  const nextBackgroundOptions = derived.backgroundEquipmentOptions?.options ?? [];
  const backgroundOptionsChanged =
    prevBackgroundOptions.length > 0 &&
    !areStartingEquipmentParsedOptionsEquivalent(prevBackgroundOptions, nextBackgroundOptions);

  const prevClassText =
    data.startingEquipmentSelectedIndex != null &&
    data.startingEquipmentOptions?.options?.[data.startingEquipmentSelectedIndex]
      ? data.startingEquipmentOptions.options[data.startingEquipmentSelectedIndex].text
      : null;
  const prevBackgroundText =
    data.backgroundEquipmentSelectedIndex != null &&
    data.backgroundEquipmentOptions?.options?.[data.backgroundEquipmentSelectedIndex]
      ? data.backgroundEquipmentOptions.options[data.backgroundEquipmentSelectedIndex].text
      : null;
  let nextEquipment = data.equipment ?? '';
  let nextEquipmentSpentGP = data.equipmentSpentGP ?? 0;
  let nextPurchasedEquipment = data.purchasedEquipment ?? [];
  const treatEquipmentAsManual =
    data.startingEquipmentSelectedIndex == null && data.backgroundEquipmentSelectedIndex == null;
  if (classOptionsChanged || backgroundOptionsChanged) {
    if (treatEquipmentAsManual) {
      // When we don't track class/background starting set selections, treat the current
      // `data.equipment` string as the final truth and do not split/strip it.
      nextEquipmentSpentGP = data.equipmentSpentGP ?? 0;
      nextPurchasedEquipment = data.purchasedEquipment ?? [];
    } else {
      const { classLines, backgroundLines, manualLines } = splitEquipmentBySource(
        data.equipment ?? '',
        prevClassText,
        prevBackgroundText,
        data.equipmentSourceByLine
      );
      const joinBuckets = (...buckets: string[][]) =>
        buckets
          .map((lines) => lines.join('\n'))
          .filter((s) => s.trim().length > 0)
          .join('\n');
      // Only drop the tier whose option list changed; preserve the other source + manual additions.
      if (classOptionsChanged && backgroundOptionsChanged) {
        nextEquipment = joinBuckets(manualLines);
      } else if (classOptionsChanged) {
        nextEquipment = joinBuckets(backgroundLines, manualLines);
      } else {
        nextEquipment = joinBuckets(classLines, manualLines);
      }
      nextEquipmentSpentGP = 0;
      nextPurchasedEquipment = [];
    }
  } else {
    if (classOptionsChanged && prevClassText) {
      nextEquipment = getEquipmentWithoutSource(nextEquipment, prevClassText);
    }
    if (backgroundOptionsChanged && prevBackgroundText) {
      nextEquipment = getEquipmentWithoutSource(nextEquipment, prevBackgroundText);
    }
  }
  const startingEquipmentSelectedIndex = classOptionsChanged
    ? null
    : (data.startingEquipmentSelectedIndex ?? null);
  const backgroundEquipmentSelectedIndex = backgroundOptionsChanged
    ? null
    : (data.backgroundEquipmentSelectedIndex ?? null);

  const nextBgAbilityOption = derived.backgroundAbilityScoreOption ?? null;
  const prevBgAbilityOption = data.backgroundAbilityScoreOption ?? null;
  const allowedChanged =
    JSON.stringify(nextBgAbilityOption?.allowedAbilityNames ?? []) !==
    JSON.stringify(prevBgAbilityOption?.allowedAbilityNames ?? []);
  // Only reset when the background option genuinely changed (not when prevBgAbilityOption is null,
  // which happens when loading a saved sheet — backgroundAbilityScoreOption is not persisted).
  const bgAbilityOptionChanged =
    prevBgAbilityOption !== null &&
    (nextBgAbilityOption?.totalPoints !== prevBgAbilityOption?.totalPoints ||
      nextBgAbilityOption?.maxPerAbility !== prevBgAbilityOption?.maxPerAbility ||
      allowedChanged);
  const backgroundAbilityScoreOption = nextBgAbilityOption;
  const backgroundAbilityScoreIncrease =
    !nextBgAbilityOption || bgAbilityOptionChanged
      ? {}
      : (data.backgroundAbilityScoreIncrease ?? {});

  // Preserve tool proficiency choices for keys that still appear in derived proficiencies.
  // Keys matching "Choose N/one ..." are real proficiency choices — filtered by derived profs.
  // Equipment placeholder keys are source-scoped: class keys are dropped when class options
  // change, background keys when background options change.
  const derivedProfs = derived.proficiencies ?? '';
  const prevChoices = data.toolProficiencyChoices ?? {};
  const toolProficiencyChoices: Record<string, string[]> = {};
  const TOOL_PROFICIENCY_KEY_RE = /^Choose\s+(?:\d+|one)\b/i;
  const EQUIPMENT_CLASS_CHOICE_KEYS = new Set(['Musical Instrument of your choice']);
  const EQUIPMENT_BG_CHOICE_KEYS = new Set(['Musical Instrument of your choice (Background)']);
  for (const key of Object.keys(prevChoices)) {
    if (TOOL_PROFICIENCY_KEY_RE.test(key)) {
      if (toolChooseKeyStillReferencedInDerived(derivedProfs, key))
        toolProficiencyChoices[key] = prevChoices[key];
    } else if (classOptionsChanged && EQUIPMENT_CLASS_CHOICE_KEYS.has(key)) {
      // Class equipment options changed — drop class-scoped placeholder choices
    } else if (backgroundOptionsChanged && EQUIPMENT_BG_CHOICE_KEYS.has(key)) {
      // Background equipment options changed — drop background-scoped placeholder choices
    } else {
      toolProficiencyChoices[key] = prevChoices[key];
    }
  }

  // Preserve only raceTraitSelections whose trait still exists in derived features. On a class
  // change, also drop any selection belonging to a class-sourced feature (e.g. Fighting Style,
  // shared by Fighter/Paladin/Ranger) — identified by source, so race/background traits are kept
  // and no feature name is hardcoded.
  const currentFeatureNames = new Set(derived.featureDetails.map((f) => f.name));
  const classFeatureNames = new Set(
    derived.featureDetails.filter((f) => f.source === 'class').map((f) => f.name)
  );
  const raceTraitSelections: Record<string, string> = {};
  for (const [name, sel] of Object.entries(data.raceTraitSelections ?? {})) {
    if (!currentFeatureNames.has(name)) continue;
    if (classChanged && classFeatureNames.has(name)) continue;
    raceTraitSelections[name] = sel;
  }

  // Same as raceTraitSelections: drop the spellcasting-ability choice for Elven Lineage /
  // Gnomish Lineage / Fiendish Legacy when the trait disappears (e.g. race changed away),
  // so a stale choice doesn't silently reappear if the trait comes back later.
  const raceLineageSpellcastingAbility: Record<string, string> = {};
  for (const [name, ability] of Object.entries(data.raceLineageSpellcastingAbility ?? {})) {
    if (currentFeatureNames.has(name)) raceLineageSpellcastingAbility[name] = ability;
  }

  const keenSensesFeat = derived.featureDetails.find(
    (f) => f.source === 'race' && f.name.trim().toLowerCase() === 'keen senses'
  );
  const keenSensesOpts = keenSensesFeat?.options ?? [];
  if (keenSensesFeat && keenSensesOpts.length > 0) {
    const traitName = keenSensesFeat.name;
    const prevSel = raceTraitSelections[traitName];
    if (prevSel && !keenSensesOpts.some((o) => o.key === prevSel)) {
      delete raceTraitSelections[traitName];
    }
    if (keenSensesOpts.length === 1) {
      raceTraitSelections[traitName] = keenSensesOpts[0].key;
    }
    const sel = raceTraitSelections[traitName];
    if (sel && keenSensesOpts.some((o) => o.key === sel)) {
      skillProficiencies[sel] = true;
    }
  }

  const skillfulFeat = derived.featureDetails.find(
    (f) => f.name.trim().toLowerCase() === 'skillful'
  );
  const skillfulOpts = skillfulFeat?.options ?? [];
  if (skillfulFeat && skillfulOpts.length > 0) {
    const traitName = skillfulFeat.name;
    const prevSf = raceTraitSelections[traitName];
    if (prevSf && !skillfulOpts.some((o) => o.key === prevSf)) {
      delete raceTraitSelections[traitName];
    }
    const sfSel = raceTraitSelections[traitName];
    if (sfSel && skillfulOpts.some((o) => o.key === sfSel)) {
      skillProficiencies[sfSel] = true;
    }
  }

  // High Elf cantrip override: clear when race changes or lineage is no longer High Elf
  const elvenLineageFeatForHighElf = derived.featureDetails.find(
    (f) => f.source === 'race' && f.name.trim().toLowerCase() === 'elven lineage'
  );
  const highElfCantripName =
    elvenLineageFeatForHighElf &&
    raceTraitSelections[elvenLineageFeatForHighElf.name] === 'high-elf'
      ? (data.highElfCantripName ?? null)
      : null;

  // Class-ability selections are cleared only when their granting class feature is gone (the class
  // changed away from one that has it) — never on a level change. Leveling up adds features but
  // keeps the ones already present, so picks must survive level changes (and a higher level may even
  // grant more of them). Each selection below is reset by its own feature's presence, not a blanket
  // "the class feature set changed" flag (which also flips when a new feature unlocks on level-up).
  const hasClassFeature = (name: string): boolean =>
    derived.featureDetails.some(
      (f) => f.source === 'class' && f.name.trim().toLowerCase() === name
    );
  // A class-feature selection survives while its feature is present, but a class change drops it even
  // when the new class shares the feature (Weapon Mastery, Expertise, …). Identified by feature
  // source, so there's no hardcoded per-feature reset list.
  const keepsClassSelection = (name: string): boolean => hasClassFeature(name) && !classChanged;
  // Per granting class: its own list, sliced to its own count at its own level (a level-down trims
  // the excess; a level-up keeps everything, since the count only grows). Buckets whose class no
  // longer grants the feature are dropped, and a legacy bare bucket is rebound to the first class
  // that does grant it, which is what a pre-multiclass sheet meant by it.
  const weaponMasteryWeaponIdsByClass: Record<string, string[]> = {};
  if (keepsClassSelection('weapon mastery')) {
    const stored = data.weaponMasteryWeaponIdsByClass ?? {};
    const instances = findClassFeatures(derived.featureDetails, 'Weapon Mastery');
    const legacy = stored[''] ?? null;
    instances.forEach((feature, index) => {
      const key = weaponMasteryClassKey(feature);
      const picks = stored[key] ?? (index === 0 && legacy ? legacy : []);
      const max = getWeaponMasteryMaxForFeature(
        { ...data, featureDetails: derived.featureDetails },
        feature
      );
      if (picks.length > 0 || key !== '') weaponMasteryWeaponIdsByClass[key] = picks.slice(0, max);
    });
  }
  const primalKnowledgeSkillKey = keepsClassSelection('primal knowledge')
    ? (data.primalKnowledgeSkillKey ?? null)
    : null;
  if (primalKnowledgeSkillKey) skillProficiencies[primalKnowledgeSkillKey] = true;
  const metamagicOptionKeys = keepsClassSelection('metamagic')
    ? (data.metamagicOptionKeys ?? [])
    : [];

  // Per granting class: its own picks, sliced to its own allowance (2 per gain at ITS level). A
  // bucket whose class no longer grants Expertise is dropped; a legacy bare bucket goes to the first.
  const expertiseSkillKeysByClass: Record<string, string[]> = {};
  if (keepsClassSelection('expertise')) {
    const stored = data.expertiseSkillKeysByClass ?? {};
    const legacy = stored[''] ?? null;
    findClassFeatures(derived.featureDetails, 'Expertise').forEach((feature, index) => {
      const key = expertiseClassKey(feature);
      const picks = stored[key] ?? (index === 0 && legacy ? legacy : []);
      if (picks.length > 0 || key !== '') {
        expertiseSkillKeysByClass[key] = picks.slice(0, getExpertiseMaxForFeature(feature));
      }
    });
  }
  const expertiseSkillKeys = getAllExpertiseSkillKeys({ expertiseSkillKeysByClass });

  const hasDeftExplorerFeat = derived.featureDetails.some(
    (f) => f.source === 'class' && f.name.trim().toLowerCase() === 'deft explorer'
  );
  const hasScholarFeat = derived.featureDetails.some(
    (f) => f.source === 'class' && f.name.trim().toLowerCase() === 'scholar'
  );
  let scholarExpertiseSkillKey =
    hasScholarFeat && !classChanged ? (data.scholarExpertiseSkillKey ?? null) : null;
  let deftExplorerExpertiseSkillKey =
    hasDeftExplorerFeat && !classChanged ? (data.deftExplorerExpertiseSkillKey ?? null) : null;
  let deftExplorerLanguageNames =
    hasDeftExplorerFeat && !classChanged ? [...(data.deftExplorerLanguageNames ?? [])] : [];
  if (scholarExpertiseSkillKey && skillProficiencies[scholarExpertiseSkillKey] !== true) {
    scholarExpertiseSkillKey = null;
  }
  if (deftExplorerExpertiseSkillKey && skillProficiencies[deftExplorerExpertiseSkillKey] !== true) {
    deftExplorerExpertiseSkillKey = null;
  }
  if (deftExplorerExpertiseSkillKey && expertiseSkillKeys.includes(deftExplorerExpertiseSkillKey)) {
    deftExplorerExpertiseSkillKey = null;
  }
  {
    const seen = new Set<string>();
    const k = (s: string) => s.trim().toLowerCase();
    deftExplorerLanguageNames = deftExplorerLanguageNames
      .map((s) => String(s).trim())
      .filter(Boolean)
      .filter((s) => {
        const key = k(s);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 2);
  }

  const hasThievesCantFeat = derived.featureDetails.some(
    (f) => f.source === 'class' && isThievesCantFeature(f)
  );
  const thievesCantExtraLanguageName =
    hasThievesCantFeat && !classChanged
      ? (() => {
          const raw = data.thievesCantExtraLanguageName;
          if (raw == null || String(raw).trim() === '') return null;
          return String(raw).trim();
        })()
      : null;

  const eldritchFeat = derived.featureDetails.find(
    (f) => f.source === 'class' && isEldritchInvocationsFeature(f)
  );
  const maxEldritchSelections =
    getEldritchInvocationsKnown(eldritchFeat, data.level) || (eldritchFeat?.gainCount ?? 0);
  let eldritchInvocationSelections: EldritchInvocationSelection[] = [];
  if (eldritchFeat && maxEldritchSelections > 0 && !classChanged) {
    // Keep only selections that belong to the current class's invocation list. This clears
    // leftovers on a class change (the feat is gone for non-Warlocks) WITHOUT wiping valid
    // picks on a level-up — so leveling never silently drops invocations.
    const validKeys = new Set((eldritchFeat.options ?? []).map((o) => o.key));
    const known = (data.eldritchInvocationSelections ?? []).filter((s) => validKeys.has(s.key));
    const sliced =
      known.length > maxEldritchSelections ? known.slice(0, maxEldritchSelections) : known;
    // Drop selections orphaned by a level drop or a removed prerequisite invocation/pact.
    eldritchInvocationSelections = pruneEldritchInvocationSelections(sliced, eldritchFeat.options ?? [], {
      characterLevel: data.level,
      featureNamesLower: derived.featureDetails.map((f) => f.name.trim().toLowerCase()),
    });
  }

  const mysticArcanumFeat = derived.featureDetails.find(
    (f) => f.source === 'class' && isMysticArcanumFeature(f)
  );
  const maxMysticArcanumGains = mysticArcanumFeat?.gainCount ?? 0;
  let mysticArcanumSpellNamesByGain: (string | null)[];
  if (!mysticArcanumFeat || maxMysticArcanumGains === 0) {
    mysticArcanumSpellNamesByGain = [];
  } else {
    const prev = data.mysticArcanumSpellNamesByGain ?? [];
    mysticArcanumSpellNamesByGain = Array.from({ length: maxMysticArcanumGains }, (_, i) => {
      if (i >= prev.length) return null;
      const v = prev[i];
      return v != null && String(v).trim() ? String(v).trim() : null;
    });
  }

  // Subclass feature selections: kept as long as the feature exists (changing
  // subclass/class removes the feature from the derived data, which clears the choices).
  const hasSubclassFeature = (matches: (name: string) => boolean): boolean =>
    derived.featureDetails.some((f) => f.source === 'subclass' && matches(f.name));
  const bonusProficienciesSkillKeys = hasSubclassFeature(isBonusProficienciesFeatureName)
    ? (data.bonusProficienciesSkillKeys ?? []).slice(0, 3)
    : [];
  for (const k of bonusProficienciesSkillKeys) skillProficiencies[k] = true;
  const additionalFightingStyleFeatId = hasSubclassFeature(isAdditionalFightingStyleFeatureName)
    ? (data.additionalFightingStyleFeatId ?? null)
    : null;
  const magicalDiscoveriesSpellNames = hasSubclassFeature(isMagicalDiscoveriesFeatureName)
    ? [...(data.magicalDiscoveriesSpellNames ?? [])]
    : [];
  // Leveling down shrinks the max spell level and the free-choice quota; without the cut the
  // leftovers would be invisible in the panel (which only lists castable levels) while still using the quota.
  const evocationSavantSpellbookByLevel = hasSubclassFeature(isEvocationSavantFeatureName)
    ? clampEvocationSavantSpellbook(data.evocationSavantSpellbookByLevel, data.level)
    : {};

  const asiClassFeat = derived.featureDetails.find(
    (f) => f.source === 'class' && f.name.trim().toLowerCase() === 'ability score improvement'
  );
  // Summed across classes, not `.find().gainCount`: each class grants ASIs on its own schedule, so a
  // Rogue 4 / Wizard 4 owes TWO. Reading the first feature alone truncated the array to one and the
  // second gain was silently dropped on every load, manual sheets included.
  const maxAsiGains = sumClassFeatureGainCount(
    derived.featureDetails,
    'ability score improvement'
  );

  let abilityScoreImprovementByGainResolved: AbilityScoreImprovementGainChoice[];

  if (!asiClassFeat || maxAsiGains === 0) {
    abilityScoreImprovementByGainResolved = [];
  } else {
    // Resolve the ASI against the DERIVED features/background, not the stale input. On load a
    // saved sheet has empty featureDetails (not persisted), so using `data` here would compute
    // the wrong caps/flags (e.g. miss Primal Champion's 25 cap, miscount Epic Boon) and clamp
    // valid choices — making the viewer disagree with the editor.
    const dataForAsiResolution: CharacterFormData = {
      ...data,
      featureDetails: derived.featureDetails,
      backgroundAbilityScoreOption,
      backgroundAbilityScoreIncrease,
    };
    const byGain = abilityScoreImprovementByGainForCount(data, maxAsiGains);
    abilityScoreImprovementByGainResolved = canApplyAbilityScoreImprovementASI(dataForAsiResolution)
      ? clampAbilityScoreImprovementByGain(byGain, maxAsiGains, dataForAsiResolution)
      : byGain.map((g) =>
          g?.kind === 'increase_scores' && sumIncreaseScoresInGain(g) > 0 ? null : g
        );
  }

  const base: CharacterFormData = {
    ...data,
    raceTraitSelections,
    raceLineageSpellcastingAbility,
    hitDice: formatHitDicePool(derived.hitDicePool ?? []) || (derived.hitDice ?? ''),
    hitDicePool: derived.hitDicePool ?? [],
    speed: speedStr,
    proficiencies: derived.proficiencies,
    features: derived.features,
    featureDetails: derived.featureDetails,
    savingThrows: derived.savingThrows,
    skillProficiencies,
    classSkillOptions: derived.classSkillOptions,
    classSkillOptionsByClass: derived.classSkillOptionsByClass ?? {},
    classSkillProficiencyKeys,
    backgroundSkillKeys,
    toolProficiencyChoices,
    // Holy Symbol picks are scoped to the starting-equipment options; drop the tier whose options changed.
    holySymbolChoiceItemIds: {
      class: classOptionsChanged ? null : (data.holySymbolChoiceItemIds?.class ?? null),
      background: backgroundOptionsChanged
        ? null
        : (data.holySymbolChoiceItemIds?.background ?? null),
    },
    startingEquipmentOptions: derived.startingEquipmentOptions,
    startingEquipmentSelectedIndex,
    backgroundEquipmentOptions: derived.backgroundEquipmentOptions,
    backgroundEquipmentSelectedIndex,
    backgroundAbilityScoreOption,
    backgroundAbilityScoreIncrease,
    equipment: nextEquipment,
    equipmentSpentGP: nextEquipmentSpentGP,
    purchasedEquipment: nextPurchasedEquipment,
    weaponMasteryWeaponIdsByClass,
    primalKnowledgeSkillKey,
    metamagicOptionKeys,
    expertiseSkillKeysByClass,
    scholarExpertiseSkillKey,
    deftExplorerExpertiseSkillKey,
    deftExplorerLanguageNames,
    thievesCantExtraLanguageName,
    highElfCantripName,
    eldritchInvocationSelections,
    mysticArcanumSpellNamesByGain,
    abilityScoreImprovementByGain: abilityScoreImprovementByGainResolved,
    bonusProficienciesSkillKeys,
    additionalFightingStyleFeatId,
    magicalDiscoveriesSpellNames,
    evocationSavantSpellbookByLevel,
  };

  // Keep Magic Initiate and Skilled selections in sync with their active sources. The
  // source-changing panels call these same helpers so a removed source resets immediately,
  // even when this full derivation does not re-run. Feat prerequisites are reconciled first so any
  // feat dropped for an unmet prerequisite also releases the MI/Skilled source it granted.
  if (featsList && featsList.length > 0) {
    Object.assign(base, reconcileFeatPrerequisites(base, featsList));
    Object.assign(base, reconcileMagicInitiateChoices(base, featsList));
    Object.assign(base, reconcileSkilledChoices(base, featsList));
  }
  Object.assign(base, reconcileDependentSelections(base));

  return applyCombatFromAttributes(base, featsList);
}

/**
 * Re-validates selections that depend on already-computed sheet state (no rule-item parsing, so it
 * is cheap enough to run on every edit). A selection is reset the moment what it referenced becomes
 * invalid — e.g. Expertise on a skill that loses its proficiency after a Skilled pick is removed or
 * a sub-race changes. Returns the same object when nothing needs pruning (so it never forces a
 * needless re-render). This is the single, central guard against the "stale selection" bug class;
 * extend it here when a new selection that references dynamic state is added.
 */
export function reconcileDependentSelections(data: CharacterFormData): CharacterFormData {
  const prof = data.skillProficiencies ?? {};
  let next = data;

  // Expertise (and its Scholar / Deft Explorer variants) can only apply to a skill the character is
  // currently proficient in.
  const expertiseByClass = data.expertiseSkillKeysByClass ?? {};
  const prunedExpertise = Object.fromEntries(
    Object.entries(expertiseByClass).map(([classKey, keys]) => [
      classKey,
      keys.filter((k) => prof[k] === true),
    ])
  );
  if (
    Object.entries(prunedExpertise).some(
      ([classKey, keys]) => keys.length !== (expertiseByClass[classKey] ?? []).length
    )
  ) {
    next = { ...next, expertiseSkillKeysByClass: prunedExpertise };
  }
  if (data.scholarExpertiseSkillKey && prof[data.scholarExpertiseSkillKey] !== true) {
    next = { ...next, scholarExpertiseSkillKey: null };
  }
  if (data.deftExplorerExpertiseSkillKey && prof[data.deftExplorerExpertiseSkillKey] !== true) {
    next = { ...next, deftExplorerExpertiseSkillKey: null };
  }

  // Fighting Style cantrips (Blessed/Druidic Warrior) exist only while that option is the active
  // Fighting Style choice; clear them when it isn't (switched to a feat / different style / feature
  // gone), and clamp if somehow over the limit.
  // Per class: only the instance whose own option grants cantrips keeps them, and a bucket whose
  // class no longer grants Fighting Style is dropped (a legacy bare bucket is rebound to the first).
  {
    const instances = findClassFeatures(next.featureDetails, 'Fighting Style');
    const stored = next.fightingStyleByClass ?? {};
    const legacy = stored[''];
    const rebuilt: NonNullable<CharacterFormData['fightingStyleByClass']> = {};
    instances.forEach((feature, index) => {
      const key = fightingStyleClassKey(feature);
      const pick = stored[key] ?? (index === 0 && legacy ? legacy : null);
      if (!pick) return;
      const grant = getFightingStyleCantripGrant({ fightingStyleByClass: { [key]: pick } }, feature);
      rebuilt[key] = {
        ...pick,
        cantrips: grant ? (pick.cantrips ?? []).slice(0, grant.max) : [],
      };
    });
    if (JSON.stringify(rebuilt) !== JSON.stringify(stored)) {
      next = { ...next, fightingStyleByClass: rebuilt };
    }
  }

  return next;
}
