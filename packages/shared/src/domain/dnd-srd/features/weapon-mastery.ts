import type { CharacterFormData } from '../character/character-form-data';
import { featureClassLevel } from '../character/class-entries';

const WEAPON_MASTERY_COUNT_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
};

interface WeaponMasteryFeature {
  desc?: string;
  tableData?: Array<{ label: string; rows: Array<{ level: number; value: string }> }>;
}

/** Fixed count stated in the desc ("two kinds of weapons") for classes with no level-scaled table. */
function parseWeaponMasteryCountFromDesc(desc: string): number | null {
  const m = desc
    .toLowerCase()
    .match(/\b(one|two|three|four|five|six|seven|eight)\s+kinds?\s+of\b[^.]*?\bweapons?\b/);
  return m ? (WEAPON_MASTERY_COUNT_WORDS[m[1]] ?? null) : null;
}

/**
 * How many weapons a character can master at `currentLevel`. Fighter/Barbarian scale the count by
 * level through the class table (`tableData`); Rogue/Paladin/Ranger instead have a fixed count
 * written into the feature description ("two kinds of weapons") with no table. Without the desc
 * fallback the limit reads as 0, which the pickers treat as "unlimited" — that was the Rogue bug.
 */
export function computeWeaponMasteryMaxSelections(
  feature: WeaponMasteryFeature | undefined,
  currentLevel: number,
): number {
  if (!feature) return 0;
  const table =
    feature.tableData?.find((t) => t.label.trim().toLowerCase() === 'weapon mastery') ??
    feature.tableData?.[0];
  const countFromTable =
    table?.rows
      ?.filter((row) => row.level <= currentLevel)
      .sort((a, b) => a.level - b.level)
      .slice(-1)[0]?.value ?? null;
  if (countFromTable != null) return parseInt(String(countFromTable), 10) || 0;
  return parseWeaponMasteryCountFromDesc(feature.desc ?? '') ?? 0;
}

/** Bucket key for a Weapon Mastery instance: the granting class, `''` on pre-multiclass data. */
export const weaponMasteryClassKey = (
  feature: { sourceClassId?: string } | undefined
): string => feature?.sourceClassId ?? '';

/** What THIS class's Weapon Mastery grants, read at its own level. */
export function getWeaponMasteryMaxForFeature(
  data: CharacterFormData,
  feature: (WeaponMasteryFeature & { sourceClassId?: string }) | undefined
): number {
  if (!feature) return 0;
  return computeWeaponMasteryMaxSelections(
    feature,
    Math.max(1, Math.min(20, featureClassLevel(data, feature)))
  );
}

/**
 * The weapons THIS class bound its mastery to.
 *
 * Each granting class keeps its own list: with one flat field, opening the Paladin's panel and the
 * Fighter's panel edited the same picks, so choosing in one erased the other.
 */
export function getWeaponMasteryPicks(
  data: CharacterFormData,
  feature: { sourceClassId?: string } | undefined
): string[] {
  const byClass = data.weaponMasteryWeaponIdsByClass ?? {};
  const key = weaponMasteryClassKey(feature);
  // A sheet saved before the split has one bare bucket; it belongs to whichever class is asking, as
  // long as only one grants the feature (the derivation rebinds it as soon as it runs).
  return byClass[key] ?? (key !== '' && Object.keys(byClass).length <= 1 ? (byClass[''] ?? []) : []);
}

/** Replaces one class's picks, leaving every other class's list untouched. */
export function setWeaponMasteryPicks(
  data: CharacterFormData,
  feature: { sourceClassId?: string } | undefined,
  weaponIds: string[]
): Partial<CharacterFormData> {
  const byClass = { ...(data.weaponMasteryWeaponIdsByClass ?? {}) };
  const key = weaponMasteryClassKey(feature);
  // Writing under the real class also retires the legacy bare bucket this pick came from.
  if (key !== '' && byClass[''] != null && byClass[key] == null) delete byClass[''];
  byClass[key] = weaponIds;
  return { weaponMasteryWeaponIdsByClass: byClass };
}

/**
 * What the OTHER classes already mastered.
 *
 * The picker shows these checked and disabled: mastering the same weapon twice buys nothing, and a
 * player looking at the Paladin's panel needs to see that the Fighter already took the Battleaxe.
 */
export function getWeaponMasteryPicksFromOtherClasses(
  data: CharacterFormData,
  feature: { sourceClassId?: string } | undefined
): string[] {
  const key = weaponMasteryClassKey(feature);
  return [
    ...new Set(
      Object.entries(data.weaponMasteryWeaponIdsByClass ?? {})
        .filter(([classKey]) => classKey !== key)
        .flatMap(([, ids]) => ids)
    ),
  ];
}

/** Every weapon the character has mastery with, across classes: what the attacks list renders. */
export function getAllWeaponMasteryWeaponIds(data: CharacterFormData): string[] {
  return [...new Set(Object.values(data.weaponMasteryWeaponIdsByClass ?? {}).flat())];
}
