/**
 * Per-class spellcasting: each casting class's own allowance, read at ITS level, and which class
 * owns each spell the player picked.
 *
 * The SRD says "each spell you prepare is associated with one of your classes", and that association
 * is what decides the spellcasting ability the spell uses and the quota it spends. Both the editor
 * and the save-time validation resolve it here, so the counts they enforce can never disagree.
 */
import type { RuleItemResponse } from '../../../types/ruleitem';
import type { CharacterFormData, FeatureDetail } from '../character/character-form-data';
import { realClassEntries } from '../character/class-entries';
import {
  DIVINE_ORDER_DISPLAY_NAME,
  PRIMAL_ORDER_DISPLAY_NAME,
  isDivineOrderThaumaturge,
  isPrimalOrderMagician,
} from '../features/feature-matchers';
import { getClassCasterType, type ClassCasterType } from './multiclass-spellcasting';
import {
  findSpellcastingFeatureDetail,
  getMaxCantrips,
  getMaxPreparedSpells,
  getTableValueAtLevel,
  parseTableInt,
} from './spellcasting-limits';
import { spellClassTag } from './spells';

const ABILITY_NAMES = [
  'Strength',
  'Dexterity',
  'Constitution',
  'Intelligence',
  'Wisdom',
  'Charisma',
] as const;

const ABILITY_ALTERNATION = ABILITY_NAMES.join('|');

// Ordered most-specific first: the SRD writes the ability several ways, and a loose pattern would
// match the first ability NAMED in the desc rather than the one declared as the spellcasting ability.
// `your|the` covers both wordings in the pack: the Cleric says "Wisdom is YOUR spellcasting ability",
// the Warlock "Charisma is THE spellcasting ability".
const DECLARES = String.raw`is\s+(?:your|the)\s+spellcasting\s+ability`;
const ABILITY_PATTERNS: RegExp[] = [
  new RegExp(
    `Spellcasting Ability[:.]\\s*(${ABILITY_ALTERNATION})\\b[\\s\\S]{0,120}?${DECLARES}`,
    'i'
  ),
  new RegExp(
    `Spellcasting Ability[\\s\\S]{0,80}?(${ABILITY_ALTERNATION})\\b[\\s\\S]{0,120}?${DECLARES}`,
    'i'
  ),
  new RegExp(`\\b(${ABILITY_ALTERNATION})\\b\\s+${DECLARES}`, 'i'),
  new RegExp(`spellcasting\\s+ability\\s+is\\s*(${ABILITY_ALTERNATION})\\b`, 'i'),
  new RegExp(`spellcasting\\s+ability\\s*[:.]\\s*(${ABILITY_ALTERNATION})\\b`, 'i'),
];

/**
 * The ability a class casts with, read from its Spellcasting / Pact Magic text. `fallbackDetails`
 * (that class's other features) is scanned only when the feature text doesn't declare it.
 */
export function readSpellcastingAbility(
  feature: FeatureDetail | null | undefined,
  fallbackDetails?: readonly FeatureDetail[]
): string {
  const sourceText =
    feature?.desc ??
    (fallbackDetails ?? [])
      .map((f) => f.desc ?? '')
      .filter(Boolean)
      .join('\n');
  if (!sourceText.trim()) return '';

  for (const re of ABILITY_PATTERNS) {
    const match = sourceText.match(re);
    if (match?.[1]) {
      const found = match[1].toLowerCase();
      return ABILITY_NAMES.find((a) => a.toLowerCase() === found) ?? '';
    }
  }
  // Last resort: an ability mentioned near the words "spellcasting ability", either side.
  for (const ability of ABILITY_NAMES) {
    const before = new RegExp(`${ability}\\b[\\s\\S]{0,160}?spellcasting\\s+ability`, 'i');
    const after = new RegExp(`spellcasting\\s+ability[\\s\\S]{0,160}?${ability}\\b`, 'i');
    if (before.test(sourceText) || after.test(sourceText)) return ability;
  }
  return '';
}

const SLOT_ORDINALS = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th'];

/**
 * Highest spell level this class may PREPARE, from its own slot columns at its own level.
 *
 * Not the same as the slot levels the character has: the Multiclass Spellcaster table hands out
 * slots this class's own progression never would, and the SRD is explicit that those extra slots
 * only upcast lower-level spells ("you can't prepare any level 3 spells, nor any level 2 Ranger
 * spells" for the book's Ranger 4 / Sorcerer 3). Returns 0 when the feature has no slot table, and
 * callers treat that as "don't restrict" rather than "nothing castable".
 */
function maxPreparedSpellLevelFromFeature(feature: FeatureDetail, level: number): number {
  const tables = feature.tableData ?? [];
  // Pact Magic has one "Slot Level" column instead of nine per-level columns.
  const slotLevelTable = tables.find((t) => t.label.toLowerCase().includes('slot level'));
  if (slotLevelTable) {
    const value = parseTableInt(getTableValueAtLevel(slotLevelTable.rows, level));
    return Math.max(0, Math.min(9, value));
  }
  let max = 0;
  for (let index = 0; index < SLOT_ORDINALS.length; index += 1) {
    const label = SLOT_ORDINALS[index];
    const table = tables.find(
      (t) => t.label.toLowerCase().includes(label) && t.label.toLowerCase().includes('slot')
    );
    if (!table) continue;
    if (parseTableInt(getTableValueAtLevel(table.rows, level)) > 0) max = index + 1;
  }
  return max;
}

/** One class that casts, with the allowance its own table grants at its own level. */
export interface CastingClass {
  classRuleItemId: string;
  className: string;
  /** Level in THIS class: every table below is read at it, never at the character level. */
  level: number;
  casterType: ClassCasterType;
  feature: FeatureDetail;
  /** Ability this class casts with (Wizard Intelligence, Cleric Wisdom, …). */
  spellcastingAbility: string;
  /** Tag identifying this class's spell list in the pack catalog. */
  spellTagKey: string;
  maxCantrips: number;
  maxPrepared: number;
  /**
   * Highest spell level this class may prepare, from ITS OWN table. 9 when the table says nothing,
   * so a missing column never blocks a pick.
   */
  maxSpellLevel: number;
}

/** The class that granted a feature by display name, for grants attached to a class-feature option. */
function sourceClassIdOfFeature(
  details: readonly FeatureDetail[],
  displayName: string
): string | null {
  const target = displayName.trim().toLowerCase();
  const hit = details.find((f) => f.name.trim().toLowerCase() === target);
  return hit?.sourceClassId ?? null;
}

/**
 * Every class the character casts with. A class qualifies by HAVING a Spellcasting / Pact Magic
 * feature, not by its name: that is what keeps a Barbarian/Warlock from being labelled a Barbarian
 * caster, and it is the same signal `usesMulticlassSpellSlots` reads.
 *
 * Pre-multiclass data has no `sourceClassId` on its features, so a single-class sheet falls back to
 * the whole feature list, exactly as before multiclassing existed.
 */
export function getCastingClasses(
  data: CharacterFormData,
  classItems: ReadonlyArray<RuleItemResponse>
): CastingClass[] {
  const entries = realClassEntries(data);
  const details = data.featureDetails ?? [];
  const singleClass = entries.length <= 1;

  // Extra cantrips from a class-feature option (Cleric Divine Order → Thaumaturge, Druid Primal
  // Order → Magician) belong to the class that granted the option, not to the character.
  const extraCantripsByClass = new Map<string, number>();
  const addExtraCantrip = (displayName: string) => {
    const classId = sourceClassIdOfFeature(details, displayName) ?? entries[0]?.classRuleItemId;
    if (!classId) return;
    extraCantripsByClass.set(classId, (extraCantripsByClass.get(classId) ?? 0) + 1);
  };
  if (isDivineOrderThaumaturge(data)) addExtraCantrip(DIVINE_ORDER_DISPLAY_NAME);
  if (isPrimalOrderMagician(data)) addExtraCantrip(PRIMAL_ORDER_DISPLAY_NAME);

  const out: CastingClass[] = [];
  for (const entry of entries) {
    const classItem = classItems.find((c) => c.id === entry.classRuleItemId) ?? null;
    const scoped = details.filter((f) => f.sourceClassId === entry.classRuleItemId);
    const own = scoped.length > 0 ? scoped : singleClass ? details : [];
    const feature = findSpellcastingFeatureDetail(own);
    if (!feature) continue;

    const level = Math.max(1, Math.min(20, Math.floor(entry.level || 1)));
    const className = (entry.className || classItem?.name || '').trim();
    out.push({
      classRuleItemId: entry.classRuleItemId,
      className,
      level,
      casterType: getClassCasterType(classItem),
      feature,
      spellcastingAbility: readSpellcastingAbility(
        feature,
        own.filter((f) => f.source === 'class')
      ),
      spellTagKey: spellClassTag(className),
      maxCantrips:
        getMaxCantrips(feature, level) + (extraCantripsByClass.get(entry.classRuleItemId) ?? 0),
      maxPrepared: getMaxPreparedSpells(feature, level),
      maxSpellLevel: maxPreparedSpellLevelFromFeature(feature, level) || 9,
    });
  }
  return out;
}

/** Key identifying one spell row: unique, since a level never holds the same spell twice. */
export function spellRowKey(level: number, name: string): string {
  return `${level}:${name.trim().toLowerCase()}`;
}

/**
 * The part of a casting class the attribution actually reads. Narrower than `CastingClass` so the AI
 * generation, which has the allowances but no derived `FeatureDetail` yet, can call it for real
 * instead of reimplementing the placement.
 */
export type SpellAllowanceSource = Pick<
  CastingClass,
  'classRuleItemId' | 'spellTagKey' | 'maxCantrips' | 'maxPrepared' | 'maxSpellLevel'
>;

export interface SpellOwnership {
  /** `spellRowKey` → owning class id, for the picks only (granted rows are free). */
  ownerByRow: Map<string, string>;
  /** Class id → cantrips picked through it. */
  pickedCantrips: Map<string, number>;
  /** Class id → level 1+ spells picked through it. */
  pickedPrepared: Map<string, number>;
}

interface AttributeSpellsInput {
  spellsByLevel: CharacterFormData['spellsByLevel'] | undefined;
  castingClasses: readonly SpellAllowanceSource[];
  /** Pack lookup, so a spell on only one class's list is pinned there instead of guessed. */
  resolveSpell?: (name: string) => RuleItemResponse | null | undefined;
}

/**
 * Which class each picked spell is prepared through.
 *
 * A row saved with `classRuleItemId` keeps it. The rest are placed the way `getClassSkillBudgets`
 * places skills: MOST CONSTRAINED first (a spell on a single class's list has one home), then into
 * the first class with room. Unattributed rows are normal, not legacy junk: everything picked while
 * the character was single-classed predates the second class.
 */
export function attributePickedSpells({
  spellsByLevel,
  castingClasses,
  resolveSpell,
}: AttributeSpellsInput): SpellOwnership {
  const ownerByRow = new Map<string, string>();
  const pickedCantrips = new Map<string, number>();
  const pickedPrepared = new Map<string, number>();
  for (const c of castingClasses) {
    pickedCantrips.set(c.classRuleItemId, 0);
    pickedPrepared.set(c.classRuleItemId, 0);
  }
  if (castingClasses.length === 0) {
    return { ownerByRow, pickedCantrips, pickedPrepared };
  }

  const known = new Set(castingClasses.map((c) => c.classRuleItemId));
  const bump = (classId: string, isCantrip: boolean) => {
    const target = isCantrip ? pickedCantrips : pickedPrepared;
    target.set(classId, (target.get(classId) ?? 0) + 1);
  };
  const hasRoom = (c: SpellAllowanceSource, isCantrip: boolean) =>
    isCantrip
      ? (pickedCantrips.get(c.classRuleItemId) ?? 0) < c.maxCantrips
      : (pickedPrepared.get(c.classRuleItemId) ?? 0) < c.maxPrepared;

  const pending: Array<{
    key: string;
    isCantrip: boolean;
    candidates: SpellAllowanceSource[];
  }> = [];

  for (const [levelStr, rows] of Object.entries(spellsByLevel ?? {})) {
    const level = Number(levelStr);
    const isCantrip = level === 0;
    for (const row of rows ?? []) {
      if (row.granted) continue;
      const key = spellRowKey(level, row.name);
      if (row.classRuleItemId && known.has(row.classRuleItemId)) {
        ownerByRow.set(key, row.classRuleItemId);
        bump(row.classRuleItemId, isCantrip);
        continue;
      }
      const item = resolveSpell?.(row.name);
      // A class that cannot prepare this level is not a candidate, so a level-3 spell on two lists
      // lands on the class that can actually prepare it.
      const eligible = castingClasses.filter((c) => isCantrip || level <= c.maxSpellLevel);
      const pool = eligible.length > 0 ? eligible : [...castingClasses];
      const onList = item ? pool.filter((c) => item.tagKeys.includes(c.spellTagKey)) : [];
      pending.push({
        key,
        isCantrip,
        candidates: onList.length > 0 ? onList : pool,
      });
    }
  }

  pending.sort((a, b) => a.candidates.length - b.candidates.length || a.key.localeCompare(b.key));
  for (const row of pending) {
    const target =
      row.candidates.find((c) => hasRoom(c, row.isCantrip)) ??
      row.candidates[0] ??
      castingClasses[0];
    ownerByRow.set(row.key, target.classRuleItemId);
    bump(target.classRuleItemId, row.isCantrip);
  }

  return { ownerByRow, pickedCantrips, pickedPrepared };
}

/** Spell save DC and attack bonus for one casting ability. */
export function computeSpellcastingStats(
  proficiencyBonus: number,
  abilityModifier: number
): { saveDc: number; attackBonus: number } {
  return {
    saveDc: 8 + proficiencyBonus + abilityModifier,
    attackBonus: proficiencyBonus + abilityModifier,
  };
}
