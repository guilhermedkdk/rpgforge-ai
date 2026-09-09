/**
 * Fixed hit points a class grants per level AFTER the first: `ceil((die + 1) / 2)`, the SRD's
 * "average" that every sheet uses instead of rolling. Exported because the class picker shows it
 * ("+5 HP (d8)") and that number must be the one the HP math actually applies.
 */
export function averageHpPerLevel(dieMax: number): number {
  return Math.ceil((dieMax + 1) / 2);
}

/** Max value of a hit die from notation, e.g. "1d8" -> 8, "1d12" -> 12; 0 if unparseable. */
export function hitDieMaxFromNotation(hitDice: string | null | undefined): number {
  const match = (hitDice ?? '').trim().match(/(\d+)\s*[dD]\s*(\d+)/);
  if (!match) return 0;
  return parseInt(match[2], 10);
}

export interface MaxHpParams {
  /** Max face of the class hit die (e.g. 8 for d8). 0 when no class/hit die yet. */
  hitDieMax: number;
  /** Constitution modifier (already effective). */
  conMod: number;
  /** Character level (clamped to 1–20). */
  level: number;
  /**
   * Extra max HP per character level, summed across every feature that grants it (Dwarven
   * Toughness = +1/level, Draconic Resilience = +1/level, …). Pack-agnostic on purpose: the caller
   * counts the active features, this function only multiplies by level. Applies even with no hit die.
   */
  bonusHpPerLevel?: number;
}

/** One class's contribution to the hit dice pool. */
export interface HitDicePoolEntryParams {
  /** Max face of that class's hit die (e.g. 10 for d10). */
  dieMax: number;
  /** Levels taken in that class. */
  levels: number;
}

export interface MaxHpForClassesParams {
  /** Per class, in class order. Index 0 is the INITIAL class: only it gets the level 1 max die. */
  pool: readonly HitDicePoolEntryParams[];
  conMod: number;
  /** Extra max HP per TOTAL character level (Dwarven Toughness). */
  bonusHpPerLevel?: number;
  /**
   * Extra max HP per level of ONE class, e.g. Draconic Resilience (+1 per Sorcerer level).
   * Indexes into `pool`, so it stays pack-agnostic: the caller resolves which feature is active.
   */
  bonusHpPerClassLevel?: ReadonlyArray<{ classIndex: number; perLevel: number }>;
}

/**
 * D&D 5e fixed (average) max HP across one or more classes.
 *
 * SRD 5.2 multiclassing: "You gain the level 1 Hit Points for a class only when your total
 * character level is 1." So exactly one level in the whole character rolls the die maximum: the
 * first level of the initial class. Every other level, including a new class's level 1, adds
 * ceil((dieMax+1)/2) + conMod using THAT class's die.
 */
export function maxHpForClasses({
  pool,
  conMod,
  bonusHpPerLevel = 0,
  bonusHpPerClassLevel = [],
}: MaxHpForClassesParams): number {
  const entries = pool.filter((p) => p.dieMax > 0 && p.levels > 0);
  let base = 0;
  let totalLevels = 0;
  let firstLevelTaken = false;
  for (const entry of entries) {
    const levels = Math.floor(entry.levels);
    totalLevels += levels;
    let remaining = levels;
    if (!firstLevelTaken) {
      base += entry.dieMax + conMod;
      remaining -= 1;
      firstLevelTaken = true;
    }
    base += remaining * (averageHpPerLevel(entry.dieMax) + conMod);
  }

  let bonus = Math.max(0, bonusHpPerLevel) * totalLevels;
  for (const { classIndex, perLevel } of bonusHpPerClassLevel) {
    const entry = pool[classIndex];
    if (!entry || entry.levels <= 0) continue;
    bonus += Math.max(0, perLevel) * Math.floor(entry.levels);
  }
  return base + bonus;
}

/**
 * Single-class max HP. Delegates to `maxHpForClasses` so there is exactly one HP formula.
 * With no hit die (hitDieMax <= 0) the base is 0; per-level HP bonuses still apply.
 */
export function maxHpForLevel({
  hitDieMax,
  conMod,
  level,
  bonusHpPerLevel = 0,
}: MaxHpParams): number {
  const lvl = Math.max(1, Math.min(20, Math.floor(level)));
  return (
    maxHpForClasses({
      pool: hitDieMax > 0 ? [{ dieMax: hitDieMax, levels: lvl }] : [],
      conMod,
      // Keeps the bonus applying even with no hit die, which is what the single-class path promised.
      bonusHpPerLevel: 0,
    }) +
    Math.max(0, bonusHpPerLevel) * lvl
  );
}
