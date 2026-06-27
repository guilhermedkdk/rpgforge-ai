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
