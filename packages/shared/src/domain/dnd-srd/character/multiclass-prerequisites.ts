/**
 * SRD 5.2 multiclass prerequisite: "you must have a score of at least 13 in the primary ability of
 * the new class and your current classes."
 *
 * One implementation for the three enforcement points (the add-class picker, the save validation
 * and the backend), so a class the picker offers can never be rejected on save.
 */
import {
  MULTICLASS_PREREQUISITE_SCORE,
  readClassMulticlassing,
  type MulticlassPrimaryAbilities,
} from '../../../schemas/class-multiclassing';
import type { RuleItemResponse } from '../../../types/ruleitem';
import { getCharacterAbilityScores } from '../derivation/ability-progression';
import { realClassEntries } from './class-entries';
import type { ClassEntry } from './character-form-data';
import type { CharacterFormData } from './character-form-data';

/** One unmet ability requirement, carrying the class that imposes it so the UI can explain why. */
export interface MulticlassPrerequisiteMiss {
  /** Full ability name, e.g. 'Strength'. For an 'any' requirement, the best candidate. */
  ability: string;
  required: number;
  actual: number;
  /** Class whose primary ability this is (the new one, or one already on the sheet). */
  className: string;
  /** True when 13 in ANY of `alternatives` satisfies it (Fighter: Strength or Dexterity). */
  alternatives: string[];
}

export interface MulticlassPrerequisiteResult {
  ok: boolean;
  missing: MulticlassPrerequisiteMiss[];
}

const scoreOf = (attributes: Record<string, number> | undefined, ability: string): number =>
  Math.trunc(attributes?.[ability] ?? 0);

/** The class's hit die as `d10`, read from `normalized.hitPoints`; empty when absent. */
export function getClassHitDie(
  classItem: Pick<RuleItemResponse, 'normalized'> | null | undefined,
): string {
  const hp = (classItem?.normalized as { hitPoints?: { hitDiceName?: string } } | undefined)
    ?.hitPoints;
  const match = (hp?.hitDiceName ?? '').match(/(\d*)\s*[dD]\s*(\d+)/);
  return match ? `d${match[2]}` : '';
}

/** Primary abilities for a class; null when the pack has no multiclassing block for it. */
export function getClassPrimaryAbilities(
  classItem: Pick<RuleItemResponse, 'normalized'> | null | undefined,
): MulticlassPrimaryAbilities | null {
  if (!classItem) return null;
  return readClassMulticlassing(classItem.normalized)?.primaryAbilities ?? null;
}

function checkOne(
  attributes: Record<string, number> | undefined,
  classItem: RuleItemResponse,
): MulticlassPrerequisiteMiss | null {
  const primary = getClassPrimaryAbilities(classItem);
  // No data for this class means no gate: a missing pack field must never block a legal build.
  if (!primary || primary.abilities.length === 0) return null;

  const scored = primary.abilities.map((ability) => ({
    ability,
    actual: scoreOf(attributes, ability),
  }));
  const satisfied =
    primary.mode === 'any'
      ? scored.some((s) => s.actual >= MULTICLASS_PREREQUISITE_SCORE)
      : scored.every((s) => s.actual >= MULTICLASS_PREREQUISITE_SCORE);
  if (satisfied) return null;

  // 'any' reports the closest score (the one the player is likeliest to raise); 'all' the lowest.
  const focus = scored.reduce((best, s) => (s.actual > best.actual ? s : best), scored[0]);
  const worst = scored.reduce((low, s) => (s.actual < low.actual ? s : low), scored[0]);
  const pick = primary.mode === 'any' ? focus : worst;

  return {
    ability: pick.ability,
    required: MULTICLASS_PREREQUISITE_SCORE,
    actual: pick.actual,
    className: classItem.name,
    alternatives: primary.mode === 'any' ? primary.abilities : [],
  };
}

/**
 * Checks the prerequisite for taking a level in `newClassItem` while already having
 * `currentClassItems`. Both sides are checked, as the SRD requires. Passing an empty
 * `currentClassItems` with the same class as `newClassItem` (a first level) always succeeds.
 */
export function getMulticlassPrerequisites(input: {
  attributes: Record<string, number> | undefined;
  currentClassItems: RuleItemResponse[];
  newClassItem: RuleItemResponse | null;
}): MulticlassPrerequisiteResult {
  const { attributes, currentClassItems, newClassItem } = input;
  const others = currentClassItems.filter((c) => c.id !== newClassItem?.id);
  // Taking the very first class is never a multiclass, so nothing to check.
  if (others.length === 0) return { ok: true, missing: [] };

  const missing: MulticlassPrerequisiteMiss[] = [];
  for (const item of newClassItem ? [newClassItem, ...others] : others) {
    const miss = checkOne(attributes, item);
    if (miss) missing.push(miss);
  }
  return { ok: missing.length === 0, missing };
}

/** Whether an already-assembled set of classes is a legal multiclass combination. */
export function getMulticlassCombinationErrors(input: {
  attributes: Record<string, number> | undefined;
  classItems: RuleItemResponse[];
}): MulticlassPrerequisiteMiss[] {
  if (input.classItems.length <= 1) return [];
  const missing: MulticlassPrerequisiteMiss[] = [];
  for (const item of input.classItems) {
    const miss = checkOne(input.attributes, item);
    if (miss) missing.push(miss);
  }
  return missing;
}

/**
 * Unmet prerequisites for the classes ALREADY on the sheet.
 *
 * The gate on the add-class picker only covers the moment a class is taken. A score can fall BELOW
 * 13 afterwards, and lowering a class level is the common way: it prunes the ASI gain that raised
 * the ability in the first place (and levelling back up re-derives an EMPTY slot, it does not
 * restore the pick). One entry point for the UI cue and for the save validation, so the field that
 * turns red and the error that blocks the save can never disagree.
 */
export function getSheetMulticlassPrerequisiteMisses(
  data: CharacterFormData,
  classes: RuleItemResponse[],
): MulticlassPrerequisiteMiss[] {
  const entries = realClassEntries(data);
  if (entries.length <= 1) return [];
  const byId = new Map(classes.map((c) => [c.id, c]));
  const classItems = entries
    .map((entry) => byId.get(entry.classRuleItemId))
    .filter((c): c is RuleItemResponse => Boolean(c));
  return getMulticlassCombinationErrors({
    attributes: getCharacterAbilityScores(data),
    classItems,
  });
}

/**
 * Which classes have to leave the sheet for the combination to be legal again.
 *
 * The SRD checks BOTH sides, so the class that FAILS is often the initial one, and that one cannot
 * be dropped: it grants the saving throws, the full proficiencies and the starting equipment. With a
 * single class there is no multiclass requirement at all, so removing the OTHERS is what makes an
 * initial-class miss legal. Hence: drop the failing multiclassed entries first (last one first, the
 * most recent decision), then keep dropping from the end until nothing fails. Never index 0, and the
 * loop always terminates because one class can never miss.
 */
export function planMulticlassPrerequisiteRemovals(
  data: CharacterFormData,
  classes: RuleItemResponse[],
): ClassEntry[] {
  const attributes = getCharacterAbilityScores(data);
  const byId = new Map(classes.map((c) => [c.id, c]));
  const itemsFor = (entries: ClassEntry[]) =>
    entries
      .map((entry) => byId.get(entry.classRuleItemId))
      .filter((c): c is RuleItemResponse => Boolean(c));

  let remaining = realClassEntries(data);
  const removed: ClassEntry[] = [];

  while (remaining.length > 1) {
    const missing = getMulticlassCombinationErrors({ attributes, classItems: itemsFor(remaining) });
    if (missing.length === 0) break;
    const failing = new Set(missing.map((m) => m.className));
    let index = -1;
    for (let i = remaining.length - 1; i > 0; i--) {
      const name = byId.get(remaining[i].classRuleItemId)?.name ?? remaining[i].className;
      if (failing.has(name)) {
        index = i;
        break;
      }
    }
    // Only the initial class fails: nothing else can go but the multiclassed entries.
    if (index === -1) index = remaining.length - 1;
    removed.push(remaining[index]);
    remaining = remaining.filter((_, i) => i !== index);
  }

  return removed;
}
