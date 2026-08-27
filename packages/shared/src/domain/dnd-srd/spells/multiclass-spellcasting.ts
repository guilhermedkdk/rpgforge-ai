/**
 * SRD 5.2 multiclass spellcasting: the combined caster level and the Multiclass Spellcaster slot
 * table. Both the web sheet and the backend recompute read these, so slots can never diverge.
 *
 * Warlock is deliberately absent from the caster-level sum: Pact Magic is a separate pool that
 * keeps its own progression (the two pools are interchangeable at cast time, not at build time).
 */
import type { RuleItemResponse } from '../../../types/ruleitem';

/** `normalized.casterType` on a CLASS rule item. */
export type ClassCasterType = 'FULL' | 'HALF' | 'PACT' | 'NONE';

/**
 * Multiclass Spellcaster table (SRD 5.2), indexed by caster level 1-20 then slot level 1-9.
 *
 * Hardcoded rather than parsed from the ingested `srd-2024_multiclassing_rule-8` row: the web
 * sheet and every backend save need it synchronously, and fetching a rule item would add a request
 * to the sheet load and a query to each recompute. `multiclass-spellcasting.test.ts` pins the rows
 * against the SRD so the constant cannot silently drift from the pack.
 */
export const MULTICLASS_SPELL_SLOTS: ReadonlyArray<readonly number[]> = [
  [2, 0, 0, 0, 0, 0, 0, 0, 0], // 1
  [3, 0, 0, 0, 0, 0, 0, 0, 0], // 2
  [4, 2, 0, 0, 0, 0, 0, 0, 0], // 3
  [4, 3, 0, 0, 0, 0, 0, 0, 0], // 4
  [4, 3, 2, 0, 0, 0, 0, 0, 0], // 5
  [4, 3, 3, 0, 0, 0, 0, 0, 0], // 6
  [4, 3, 3, 1, 0, 0, 0, 0, 0], // 7
  [4, 3, 3, 2, 0, 0, 0, 0, 0], // 8
  [4, 3, 3, 3, 1, 0, 0, 0, 0], // 9
  [4, 3, 3, 3, 2, 0, 0, 0, 0], // 10
  [4, 3, 3, 3, 2, 1, 0, 0, 0], // 11
  [4, 3, 3, 3, 2, 1, 0, 0, 0], // 12
  [4, 3, 3, 3, 2, 1, 1, 0, 0], // 13
  [4, 3, 3, 3, 2, 1, 1, 0, 0], // 14
  [4, 3, 3, 3, 2, 1, 1, 1, 0], // 15
  [4, 3, 3, 3, 2, 1, 1, 1, 0], // 16
  [4, 3, 3, 3, 2, 1, 1, 1, 1], // 17
  [4, 3, 3, 3, 3, 1, 1, 1, 1], // 18
  [4, 3, 3, 3, 3, 2, 1, 1, 1], // 19
  [4, 3, 3, 3, 3, 2, 2, 1, 1], // 20
];

/** Reads `normalized.casterType`, defaulting to NONE for anything unrecognized. */
export function getClassCasterType(
  classItem: Pick<RuleItemResponse, 'normalized'> | null | undefined,
): ClassCasterType {
  const raw = (classItem?.normalized as { casterType?: unknown } | undefined)?.casterType;
  const value = typeof raw === 'string' ? raw.toUpperCase() : '';
  return value === 'FULL' || value === 'HALF' || value === 'PACT' ? value : 'NONE';
}

export interface CasterLevelClass {
  casterType: ClassCasterType;
  level: number;
}

/**
 * Combined caster level: every level in a FULL class plus HALF the levels in each HALF class.
 *
 * SRD 5.2 rounds UP (the 2014 rules rounded down), and the halving is applied PER CLASS, matching
 * how the 2014 Sage Advice read the analogous round-down. Both facts live only here, so changing
 * the reading is a one-line edit.
 */
export function computeMulticlassCasterLevel(classes: readonly CasterLevelClass[]): number {
  let total = 0;
  for (const entry of classes) {
    const level = Math.max(0, Math.floor(entry.level || 0));
    if (level <= 0) continue;
    if (entry.casterType === 'FULL') total += level;
    else if (entry.casterType === 'HALF') total += Math.ceil(level / 2);
  }
  return Math.min(20, total);
}

/** Slots by spell level (1-9) for a combined caster level; empty below caster level 1. */
export function getMulticlassSpellSlots(casterLevel: number): Record<number, number> {
  const row = MULTICLASS_SPELL_SLOTS[Math.max(1, Math.min(20, Math.floor(casterLevel))) - 1];
  if (!row || casterLevel < 1) return {};
  const out: Record<number, number> = {};
  row.forEach((count, index) => {
    if (count > 0) out[index + 1] = count;
  });
  return out;
}

/**
 * Whether the multiclass slot table applies. Per the SRD it only kicks in "once you have the
 * Spellcasting feature from more than one class" — with a single Spellcasting class (even alongside
 * Warlock or a martial class) the character keeps that class's own table.
 */
export function usesMulticlassSpellSlots(classes: readonly CasterLevelClass[]): boolean {
  return classes.filter((c) => c.casterType === 'FULL' || c.casterType === 'HALF').length > 1;
}

/** Highest spell level the combined slots reach (0 when there are none). */
export function maxSlotLevelForCasterLevel(casterLevel: number): number {
  const slots = getMulticlassSpellSlots(casterLevel);
  const levels = Object.keys(slots).map(Number);
  return levels.length > 0 ? Math.max(...levels) : 0;
}
