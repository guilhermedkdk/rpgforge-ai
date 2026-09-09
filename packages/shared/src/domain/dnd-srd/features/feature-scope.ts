/**
 * Class-scoped access to `featureDetails`.
 *
 * `source: 'class'` alone cannot tell two classes apart, so the historic
 * `.find(f => f.source === 'class' && f.name === x)` silently keeps the FIRST match. Under
 * multiclassing that is wrong for every feature more than one class grants: Fighting Style
 * (Fighter/Paladin/Ranger), Weapon Mastery (5 classes), Expertise (Bard/Rogue), Extra Attack and
 * Ability Score Improvement (all of them). These helpers replace that pattern.
 */
import type { CharacterFormData, FeatureDetail } from '../character/character-form-data';

const nameMatches = (feature: FeatureDetail, name: string): boolean =>
  feature.name.trim().toLowerCase() === name.trim().toLowerCase();

/** Class-sourced features, optionally narrowed to one class. */
export function classFeatures(
  featureDetails: CharacterFormData['featureDetails'] | undefined,
  classRuleItemId?: string | null
): FeatureDetail[] {
  return (featureDetails ?? []).filter(
    (f) => f.source === 'class' && (classRuleItemId == null || f.sourceClassId === classRuleItemId)
  );
}

/** Every instance of a class feature by name, one per granting class. */
export function findClassFeatures(
  featureDetails: CharacterFormData['featureDetails'] | undefined,
  name: string,
  classRuleItemId?: string | null
): FeatureDetail[] {
  return classFeatures(featureDetails, classRuleItemId).filter((f) => nameMatches(f, name));
}

/**
 * Total gains of a class feature ACROSS classes. Ability Score Improvement is the case that
 * matters: a Fighter 8 / Wizard 8 has the Fighter's 2 plus the Wizard's 2, and a `.find()` would
 * have reported 2.
 */
export function sumClassFeatureGainCount(
  featureDetails: CharacterFormData['featureDetails'] | undefined,
  name: string
): number {
  return findClassFeatures(featureDetails, name).reduce((sum, f) => sum + (f.gainCount ?? 1), 0);
}
