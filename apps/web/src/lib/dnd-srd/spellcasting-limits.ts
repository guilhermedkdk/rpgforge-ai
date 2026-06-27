import type { CharacterFormData } from './character-state';

type FeatureDetail = NonNullable<CharacterFormData['featureDetails']>[number];

export function getTableValueAtLevel(
  rows: Array<{ level: number; value: string }>,
  level: number
): string {
  const sorted = [...rows].filter((r) => r.level <= level).sort((a, b) => b.level - a.level);
  return sorted[0]?.value ?? '';
}

export function parseTableInt(val: string): number {
  const stripped = val.replace(/[^0-9]/g, '');
  return stripped ? parseInt(stripped, 10) : 0;
}

/** Pact Magic takes precedence over Spellcasting (Warlock multitable layout). */
export function findSpellcastingFeatureDetail(
  featureDetails: CharacterFormData['featureDetails'] | undefined
): FeatureDetail | null {
  const details = featureDetails ?? [];
  return (
    details.find((f) => f.name.trim().toLowerCase().includes('pact magic')) ??
    details.find((f) => f.name.trim().toLowerCase().includes('spellcasting')) ??
    null
  );
}

/**
 * Number of Eldritch Invocations known at the current level, read from the feature's
 * "Invocations Known" table (e.g. 7 at level 11). The table is authoritative — the gain count
 * (how many times the feature was gained) is not the same as how many invocations are known.
 * Returns 0 when the table is absent so callers can fall back.
 */
export function getEldritchInvocationsKnown(
  feature: FeatureDetail | null | undefined,
  characterLevel: number
): number {
  const table = (feature?.tableData ?? []).find((t) =>
    t.label.trim().toLowerCase().includes('invocation')
  );
  if (!table || table.rows.length === 0) return 0;
  return parseTableInt(getTableValueAtLevel(table.rows, characterLevel));
}

export function getMaxCantrips(
  spellcastingFeature: FeatureDetail | null,
  characterLevel: number
): number {
  if (!spellcastingFeature?.tableData) return 0;
  const cantripsTbl = spellcastingFeature.tableData.find((t) =>
    t.label.toLowerCase().includes('cantrips')
  );
  if (!cantripsTbl) return 0;
  return parseTableInt(getTableValueAtLevel(cantripsTbl.rows, characterLevel));
}

export function getMaxPreparedSpells(
  spellcastingFeature: FeatureDetail | null,
  characterLevel: number
): number {
  if (!spellcastingFeature?.tableData) return 0;
  const prepTbl = spellcastingFeature.tableData.find(
    (t) =>
      t.label.toLowerCase().includes('prepared spells') ||
      t.label.toLowerCase().includes('prepared')
  );
  if (!prepTbl) return 0;
  return parseTableInt(getTableValueAtLevel(prepTbl.rows, characterLevel));
}

/**
 * Warlock Pact Magic: every slot is the same level (Slot Level table). Returns that level
 * and the total slot count, or null when the feature isn't Pact Magic / has no slots yet.
 */
export function getPactMagicInfo(
  spellcastingFeature: FeatureDetail | null,
  characterLevel: number
): { slotLevel: number; totalSlots: number } | null {
  if (!spellcastingFeature?.tableData) return null;
  if (!spellcastingFeature.name.trim().toLowerCase().includes('pact magic')) return null;
  const slotsTbl = spellcastingFeature.tableData.find((t) =>
    t.label.toLowerCase().includes('spell slots')
  );
  const slotLevelTbl = spellcastingFeature.tableData.find((t) =>
    t.label.toLowerCase().includes('slot level')
  );
  if (!slotsTbl || !slotLevelTbl) return null;
  const totalSlots = parseTableInt(getTableValueAtLevel(slotsTbl.rows, characterLevel));
  const slotLevel = parseTableInt(getTableValueAtLevel(slotLevelTbl.rows, characterLevel));
  if (slotLevel < 1 || slotLevel > 9 || totalSlots <= 0) return null;
  return { slotLevel, totalSlots };
}

export function wizardSpellbookMaxByLevel(level: number): number {
  const lv = Math.max(1, Math.min(20, Math.floor(Number(level) || 1)));
  return 6 + (lv - 1) * 2;
}

/** Cantrips picked by the player (excludes auto-granted spells). */
export function countPickedCantrips(
  spellsByLevel: CharacterFormData['spellsByLevel'] | undefined
): number {
  return (spellsByLevel?.[0] ?? []).filter((s) => !s.granted).length;
}

/** Level 1+ spells picked by the player (excludes auto-granted spells). */
export function countPickedLeveledSpells(
  spellsByLevel: CharacterFormData['spellsByLevel'] | undefined
): number {
  let count = 0;
  for (const [lvlStr, spells] of Object.entries(spellsByLevel ?? {})) {
    if (Number(lvlStr) < 1) continue;
    count += (spells ?? []).filter((s) => !s.granted).length;
  }
  return count;
}

/** Learned spellbook spells only (scroll-copied spells are extra and not counted). */
export function countWizardSpellbookSpells(
  spellbookByLevel: Record<number, string[]> | undefined
): number {
  let total = 0;
  for (let lvl = 1; lvl <= 9; lvl++) {
    const seen = new Set<string>();
    for (const name of spellbookByLevel?.[lvl] ?? []) {
      const key = String(name ?? '')
        .trim()
        .toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      total += 1;
    }
  }
  return total;
}
