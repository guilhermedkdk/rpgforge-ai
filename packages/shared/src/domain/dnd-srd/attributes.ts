import { calcModifier } from './ability';

/** Default maximum ability score from normal ASI progression (before features that raise the cap). */
export const ABILITY_SCORE_CAP_FROM_ASI = 20;

const ABILITY_CAP = 25;
/** Hard ceiling an Epic Boon's +1 can reach. Exposed so the picker can disable maxed options. */
export const EPIC_BOON_CAP = 30;
const EPIC_BOON_BONUS = 1;
const GRAPPLER_BONUS = 1;
const PRIMAL_CHAMPION_BONUS = 4;
const BODY_AND_MIND_BONUS = 4;

/**
 * Applies a feature's "increase by N, to a maximum of CAP". It never pushes a score past the cap
 * and — crucially — never *reduces* a score already at or above it: another feature can legitimately
 * have raised the score beyond this one's cap, and an increase must never make a score go down.
 */
function applyCappedIncrease(value: number, increase: number, cap: number): number {
  return value >= cap ? value : Math.min(value + increase, cap);
}

/**
 * Effective ability score = base + background increase + Epic Boon (+1, cap 30) + Grappler
 * (+1 Str/Dex, cap 20) + Primal Champion (Str/Con +4, cap 25) + Body and Mind (Dex/Wis +4, cap 25).
 * Each feature increase is capped on its own and never lowers the running total (so e.g. Grappler
 * on a Strength already at 25 leaves it at 25 instead of dragging it down to its own cap of 20).
 * A base of 0 ("not yet chosen") returns 0 so feature bonuses don't produce odd values.
 */
export function getEffectiveAttribute(
  attributes: Record<string, number>,
  backgroundAbilityScoreIncrease: Record<string, number> | undefined,
  attr: string,
  epicBoonAbilityScore?: string | null,
  hasPrimalChampion?: boolean,
  hasBodyAndMind?: boolean,
  grapplerAbilityScore?: string | null,
): number {
  const base = attributes[attr] ?? 0;
  if (base === 0) return 0;
  let value = base + (backgroundAbilityScoreIncrease?.[attr] ?? 0);
  if (epicBoonAbilityScore === attr) {
    value = applyCappedIncrease(value, EPIC_BOON_BONUS, EPIC_BOON_CAP);
  }
  if (grapplerAbilityScore === attr && (attr === 'Strength' || attr === 'Dexterity')) {
    value = applyCappedIncrease(value, GRAPPLER_BONUS, ABILITY_SCORE_CAP_FROM_ASI);
  }
  if (hasPrimalChampion && (attr === 'Strength' || attr === 'Constitution')) {
    value = applyCappedIncrease(value, PRIMAL_CHAMPION_BONUS, ABILITY_CAP);
  }
  if (hasBodyAndMind && (attr === 'Dexterity' || attr === 'Wisdom')) {
    value = applyCappedIncrease(value, BODY_AND_MIND_BONUS, ABILITY_CAP);
  }
  return value;
}

/** Score ceiling for ASI allocation (20 by default; 25 for Str/Con with Primal Champion or Dex/Wis with Body and Mind). */
export function abilityScoreCeilingForAsi(
  attr: string,
  hasPrimalChampion: boolean,
  hasBodyAndMind: boolean,
): number {
  if (hasPrimalChampion && (attr === 'Strength' || attr === 'Constitution')) {
    return ABILITY_CAP;
  }
  if (hasBodyAndMind && (attr === 'Dexterity' || attr === 'Wisdom')) {
    return ABILITY_CAP;
  }
  return ABILITY_SCORE_CAP_FROM_ASI;
}

/**
 * Ability modifier used in calculations (AC, initiative, attacks). When the base score
 * is not yet chosen (0), returns 0 instead of the real modifier so -5 never leaks in.
 */
export function getEffectiveModifier(
  attributes: Record<string, number>,
  backgroundAbilityScoreIncrease: Record<string, number> | undefined,
  attr: string,
  epicBoonAbilityScore?: string | null,
  hasPrimalChampion?: boolean,
  hasBodyAndMind?: boolean,
  grapplerAbilityScore?: string | null,
): number {
  const effective = getEffectiveAttribute(
    attributes,
    backgroundAbilityScoreIncrease,
    attr,
    epicBoonAbilityScore,
    hasPrimalChampion,
    hasBodyAndMind,
    grapplerAbilityScore,
  );
  if (effective === 0) return 0;
  return calcModifier(effective);
}
