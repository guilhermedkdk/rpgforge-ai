import { maxHpForClasses, type HitDicePoolEntryParams } from './hit-points';
import { proficiencyBonusForLevel } from './proficiency-bonus';

export interface CombatStatsInput {
  /** TOTAL character level; drives the proficiency bonus, never the hit dice. */
  level: number;
  /** Effective Dexterity modifier (already resolved from base + bonuses). */
  dexMod: number;
  /** Effective Constitution modifier (already resolved from base + bonuses). */
  conMod: number;
  /** Hit dice per class, in class order (index 0 = initial class). Empty when no class yet. */
  hitDicePool: readonly HitDicePoolEntryParams[];
  /** No class/hit die yet → base AC renders empty (matches the editor). */
  hasClass: boolean;
  /** Sum of +1-max-HP-per-TOTAL-level features (Dwarven Toughness). */
  bonusHpPerLevel?: number;
  /** +1-max-HP-per-level features tied to ONE class (Draconic Resilience → Sorcerer levels). */
  bonusHpPerClassLevel?: ReadonlyArray<{ classIndex: number; perLevel: number }>;
  /** Alert feat adds the proficiency bonus to initiative. */
  hasAlert?: boolean;
  /** Prior current HP to clamp into [0, maxHp]; when undefined, current = max. */
  previousCurrentHp?: number;
}

export interface CombatStats {
  maxHp: number;
  currentHp: number;
  /**
   * Base Armor Class (10 + Dex); '' when there is no class. The FULL AC (equipped armor,
   * Unarmored Defense, shield, Defense style) is assembled separately by `assembleArmorClass`
   * from resolved item/feature inputs — that's a display/equipment concern, not this base.
   */
  baseArmorClass: string;
  initiative: string;
}

/**
 * The deterministic combat block from already-resolved inputs (effective mods, hit die, feature
 * counts). Pack-agnostic and dependency-free beyond the sibling primitives, so BOTH the web editor
 * derivation (`applyCombatFromAttributes`) and the backend recompute call this exact function —
 * guaranteeing the server and client never disagree on maxHp / base AC / initiative.
 */
export function recomputeCombatStats(input: CombatStatsInput): CombatStats {
  const level = Math.max(1, Math.min(20, Math.floor(input.level || 1)));
  const maxHp = maxHpForClasses({
    pool: input.hitDicePool,
    conMod: input.conMod,
    bonusHpPerLevel: input.bonusHpPerLevel ?? 0,
    bonusHpPerClassLevel: input.bonusHpPerClassLevel ?? [],
  });
  const prev =
    typeof input.previousCurrentHp === 'number' && Number.isFinite(input.previousCurrentHp)
      ? input.previousCurrentHp
      : maxHp;
  // Clamp ONLY against a maxHp that could actually be computed. `hitDice` is derived from the class
  // rule item, not persisted, so the first pass after loading a sheet runs with hitDieMax 0 → maxHp 0,
  // and clamping there would DESTROY the stored currentHp: the next pass computes the real maxHp but
  // reads the already-zeroed value back as "previous", so a saved 77/122 came back as 0/122 forever.
  const currentHp = maxHp > 0 ? Math.min(Math.max(0, prev), maxHp) : Math.max(0, prev);
  const baseArmorClass = input.hasClass ? String(10 + input.dexMod) : '';
  const initiativeValue = input.hasAlert
    ? input.dexMod + proficiencyBonusForLevel(level)
    : input.dexMod;
  return { maxHp, currentHp, baseArmorClass, initiative: String(initiativeValue) };
}
