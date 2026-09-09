import {
  MULTICLASS_PREREQUISITE_SCORE,
  type MulticlassPrerequisiteMiss,
} from '@rpgforce-ai/shared';

/** `['Strength', 'Dexterity']` with an `any` requirement → `Strength or Dexterity`. */
export const abilityListText = (abilities: string[], any: boolean): string =>
  abilities.join(any ? ' or ' : ' and ');

/**
 * `Fighter needs Strength or Dexterity 13` — the sentence shape EVERY requirement badge uses, so the
 * classes already on the sheet and the ones being offered state the same rule the same way.
 */
export const requirementSentence = (className: string, abilityText: string): string =>
  `${className} needs ${abilityText} ${MULTICLASS_PREREQUISITE_SCORE}`;

/**
 * Why a class is locked, naming the class that imposes it.
 *
 * The SRD checks BOTH sides, so the blocker is often one of the character's CURRENT classes, not the
 * one being offered. Without naming it, a Warlock looking at the Fighter card read "Needs Charisma
 * 13" and reasonably concluded Fighter wanted Charisma.
 */
export function requirementText(miss: MulticlassPrerequisiteMiss, cardClassName: string): string {
  const abilityText = abilityListText(miss.abilities, miss.mode === 'any');
  return miss.className === cardClassName
    ? `Needs ${abilityText} ${miss.required}`
    : requirementSentence(miss.className, abilityText);
}

/**
 * A class ON THE SHEET that stopped meeting its requirement. Carries the current score, unlike
 * {@link requirementText}: this one runs inside the row's warning, and the score is the whole point
 * (it is what changed under the player).
 */
export function unmetRequirementSentence(miss: MulticlassPrerequisiteMiss): string {
  const abilityText = abilityListText(miss.abilities, miss.mode === 'any');
  // Which ability the score belongs to only matters when the class names more than one: with an
  // `all` requirement, "you have 10" alone leaves the player guessing which one is short.
  const score =
    miss.abilities.length > 1
      ? `you have ${miss.actual} in ${miss.ability}`
      : `you have ${miss.actual}`;
  return `${requirementSentence(miss.className, abilityText)}: ${score}.`;
}
