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
  /** Dwarven Toughness: +1 max HP per character level. */
  dwarvenToughness?: boolean;
}

/**
 * D&D 5e fixed (average) max HP:
 * level 1 = hitDieMax + conMod; each level after adds ceil((hitDieMax+1)/2) + conMod.
 * With no hit die (hitDieMax <= 0) the base is 0. Dwarven Toughness adds level either way.
 */
export function maxHpForLevel({ hitDieMax, conMod, level, dwarvenToughness }: MaxHpParams): number {
  const lvl = Math.max(1, Math.min(20, Math.floor(level)));
  const base =
    hitDieMax > 0 ? hitDieMax + conMod + (lvl - 1) * (Math.ceil((hitDieMax + 1) / 2) + conMod) : 0;
  return base + (dwarvenToughness ? lvl : 0);
}
