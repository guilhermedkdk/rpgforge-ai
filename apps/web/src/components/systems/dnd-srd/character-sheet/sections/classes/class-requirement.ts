import type { MulticlassPrerequisiteMiss } from '@rpgforce-ai/shared';

/** `Strength` → `STR`, so the requirement fits beside the class name without wrapping. */
export const abbreviateAbility = (ability: string): string => ability.slice(0, 3).toUpperCase();

/**
 * Why a class is locked, naming the class that imposes it.
 *
 * The SRD checks BOTH sides, so the blocker is often one of the character's CURRENT classes, not the
 * one being offered. Without naming it, a Warlock looking at the Fighter card read "Needs Charisma
 * 13" and reasonably concluded Fighter wanted Charisma.
 */
export function requirementText(miss: MulticlassPrerequisiteMiss, cardClassName: string): string {
  // Terse on purpose: this shares one unwrappable line with the class name in a 3-column grid, so
  // the score the player already has is left out and only the bar to clear is stated.
  const requirement =
    miss.alternatives.length > 0
      ? `${miss.alternatives.map(abbreviateAbility).join('/')} ${miss.required}`
      : `${abbreviateAbility(miss.ability)} ${miss.required}`;
  return miss.className === cardClassName
    ? `Needs ${requirement}`
    : `${miss.className} needs ${requirement}`;
}

/**
 * A class ON THE SHEET that stopped meeting its requirement. Full ability names and the current
 * score, unlike {@link requirementText}: this one runs on its own line, and the score is the whole
 * point (it is what changed under the player).
 */
export function unmetRequirementSentence(miss: MulticlassPrerequisiteMiss): string {
  const requirement =
    miss.alternatives.length > 0
      ? `${miss.alternatives.join(' or ')} ${miss.required}`
      : `${miss.ability} ${miss.required}`;
  return `${miss.className} needs ${requirement}: you have ${miss.actual}.`;
}
