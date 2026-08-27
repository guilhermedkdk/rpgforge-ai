/**
 * The `classes[]` array and its derived scalar mirrors (`className`, `classRuleItemId`, `subclass`,
 * `subclassRuleItemId`, `level`, `hitDice`). Everything that adds, removes or re-levels a class goes
 * through here, so the array and the mirrors can never disagree.
 */
import type { CharacterFormData, ClassEntry, HitDicePoolEntry } from './character-form-data';

export const MAX_CHARACTER_LEVEL = 20;

/** Blank entry for a class slot the player has not chosen yet. */
export const emptyClassEntry = (): ClassEntry => ({
  classRuleItemId: '',
  className: '',
  subclassRuleItemId: null,
  subclass: '',
  level: 1,
});

/** Class entries that actually reference a class, in order (index 0 = initial class). */
export function realClassEntries(data: Pick<CharacterFormData, 'classes'>): ClassEntry[] {
  return (data.classes ?? []).filter((c) => Boolean(c.classRuleItemId));
}

export function totalClassLevel(classes: readonly ClassEntry[]): number {
  return classes.reduce((sum, c) => sum + Math.max(1, c.level || 1), 0);
}

/** Level in one specific class; 0 when the character has no levels in it. */
export function classLevelOf(
  data: Pick<CharacterFormData, 'classes'>,
  classRuleItemId: string | null | undefined,
): number {
  if (!classRuleItemId) return 0;
  const entry = (data.classes ?? []).find((c) => c.classRuleItemId === classRuleItemId);
  return entry ? Math.max(1, entry.level || 1) : 0;
}

/**
 * The level a class feature's own table must be read at: the level in the class that GRANTED it.
 *
 * A Fighter 3 / Warlock 2 masters 3 weapons and knows 2 invocations, not the 4 and 5 the character
 * level 5 rows would give. Falls back to the character level for race/background features and for
 * pre-multiclass data, where the two are the same number anyway.
 */
export function featureClassLevel(
  data: Pick<CharacterFormData, 'classes' | 'level'>,
  feature: { sourceClassId?: string | null } | null | undefined,
): number {
  const own = classLevelOf(data, feature?.sourceClassId);
  return own > 0 ? own : Math.max(1, data.level ?? 1);
}

export function isMulticlassed(data: Pick<CharacterFormData, 'classes'>): boolean {
  return realClassEntries(data).length > 1;
}

/** `1d10` / `3d10 + 5d6`, largest die first so the primary class reads first on the sheet. */
export function formatHitDicePool(pool: readonly HitDicePoolEntry[]): string {
  const byDie = new Map<number, number>();
  for (const entry of pool) {
    if (!entry.dieMax || entry.levels <= 0) continue;
    byDie.set(entry.dieMax, (byDie.get(entry.dieMax) ?? 0) + entry.levels);
  }
  return [...byDie.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([dieMax, levels]) => `${levels}d${dieMax}`)
    .join(' + ');
}

/**
 * Rewrites every scalar mirror from `classes[]`. Called at the end of the single write path, so no
 * caller has to remember to keep the two in step.
 */
export function syncClassMirrors(data: CharacterFormData): CharacterFormData {
  const classes = data.classes ?? [];
  const primary = classes[0];
  const level = classes.length > 0 ? totalClassLevel(classes) : Math.max(1, data.level || 1);
  const hitDice = formatHitDicePool(data.hitDicePool ?? []);

  const next: CharacterFormData = {
    ...data,
    classes,
    className: primary?.className ?? '',
    classRuleItemId: primary?.classRuleItemId || null,
    subclass: primary?.subclass ?? '',
    subclassRuleItemId: primary?.subclassRuleItemId ?? null,
    level,
    // Keep the previously derived notation while the pool has not been derived yet, so a load pass
    // with an empty pool does not blank the sheet's Hit Dice field.
    hitDice: hitDice || (data.hitDicePool?.length ? '' : data.hitDice),
  };

  const unchanged =
    next.className === data.className &&
    next.classRuleItemId === data.classRuleItemId &&
    next.subclass === data.subclass &&
    next.subclassRuleItemId === data.subclassRuleItemId &&
    next.level === data.level &&
    next.hitDice === data.hitDice &&
    next.classes === data.classes;
  return unchanged ? data : next;
}

/**
 * Adds a class slot at the end (never at index 0: the initial class is load-bearing).
 * A blank slot from `createDefaultCharacterData` is replaced, not kept, or it would occupy index 0
 * and leave the mirrors pointing at an empty class.
 */
export function addClassEntry(data: CharacterFormData, entry: ClassEntry): CharacterFormData {
  const existing = realClassEntries(data);
  if (totalClassLevel([...existing, entry]) > MAX_CHARACTER_LEVEL) return data;
  return syncClassMirrors({ ...data, classes: [...existing, entry] });
}

export function removeClassEntry(data: CharacterFormData, classRuleItemId: string): CharacterFormData {
  const classes = (data.classes ?? []).filter((c) => c.classRuleItemId !== classRuleItemId);
  if (classes.length === (data.classes ?? []).length) return data;
  return syncClassMirrors({ ...data, classes });
}

/** Sets one class's level, clamped so the total never exceeds 20. Level 0 removes the class. */
export function setClassEntryLevel(
  data: CharacterFormData,
  classRuleItemId: string,
  level: number,
): CharacterFormData {
  const classes = data.classes ?? [];
  const idx = classes.findIndex((c) => c.classRuleItemId === classRuleItemId);
  if (idx === -1) return data;
  if (level < 1) {
    // The initial class defines the whole sheet, so it can be emptied but never dropped.
    return idx === 0 ? data : removeClassEntry(data, classRuleItemId);
  }
  const others = totalClassLevel(classes.filter((_, i) => i !== idx));
  const capped = Math.min(level, MAX_CHARACTER_LEVEL - others);
  if (capped === classes[idx].level) return data;
  const next = classes.map((c, i) => (i === idx ? { ...c, level: capped } : c));
  return syncClassMirrors({ ...data, classes: next });
}

/** Replaces the class in a slot, clearing that slot's subclass (a subclass never survives a swap). */
export function setClassEntryIdentity(
  data: CharacterFormData,
  index: number,
  identity: { classRuleItemId: string; className: string },
): CharacterFormData {
  const classes = data.classes ?? [];
  if (index < 0 || index >= classes.length) return data;
  const next = classes.map((c, i) =>
    i === index
      ? { ...c, ...identity, subclassRuleItemId: null, subclass: '' }
      : c,
  );
  return syncClassMirrors({ ...data, classes: next });
}

export function setClassEntrySubclass(
  data: CharacterFormData,
  classRuleItemId: string,
  subclass: { subclassRuleItemId: string | null; subclass: string },
): CharacterFormData {
  const classes = data.classes ?? [];
  const idx = classes.findIndex((c) => c.classRuleItemId === classRuleItemId);
  if (idx === -1) return data;
  const next = classes.map((c, i) => (i === idx ? { ...c, ...subclass } : c));
  return syncClassMirrors({ ...data, classes: next });
}
