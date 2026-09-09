/**
 * Expertise, PER granting class.
 *
 * Bard, Rogue and Ranger each grant their own picks (2 per gain), so a Bard 9 / Rogue 6 owes 4 + 4.
 * With one flat list the panels shared a budget: filling the Bard's four made the Rogue's picker read
 * "no room left", so the sheet could not be completed by hand OR by the AI, and both chips stayed
 * pending. Key = the granting class's rule item id (`''` only on sheets saved before the split).
 */
import type { CharacterFormData } from '../character/character-form-data';

/** Bucket key for an Expertise instance: the granting class, `''` on pre-multiclass data. */
export const expertiseClassKey = (feature: { sourceClassId?: string } | undefined): string =>
  feature?.sourceClassId ?? '';

/** What THIS class's Expertise grants: 2 skills per gain. */
export function getExpertiseMaxForFeature(feature: { gainCount?: number } | undefined): number {
  if (!feature) return 0;
  return (feature.gainCount ?? 1) * 2;
}

/** The skills THIS class doubled; a legacy bare bucket answers while it is the only one stored. */
export function getExpertisePicks(
  data: Pick<CharacterFormData, 'expertiseSkillKeysByClass'>,
  feature: { sourceClassId?: string } | undefined
): string[] {
  const byClass = data.expertiseSkillKeysByClass ?? {};
  const key = expertiseClassKey(feature);
  return (
    byClass[key] ?? (key !== '' && Object.keys(byClass).length <= 1 ? (byClass[''] ?? []) : [])
  );
}

/** Replaces one class's picks, leaving every other class's list untouched. */
export function setExpertisePicks(
  data: CharacterFormData,
  feature: { sourceClassId?: string } | undefined,
  skillKeys: string[]
): Partial<CharacterFormData> {
  const byClass = { ...(data.expertiseSkillKeysByClass ?? {}) };
  const key = expertiseClassKey(feature);
  if (key !== '' && byClass[''] != null && byClass[key] == null) delete byClass[''];
  byClass[key] = skillKeys;
  return { expertiseSkillKeysByClass: byClass };
}

/** What the OTHER classes already doubled: shown checked and disabled, never picked twice. */
export function getExpertisePicksFromOtherClasses(
  data: Pick<CharacterFormData, 'expertiseSkillKeysByClass'>,
  feature: { sourceClassId?: string } | undefined
): string[] {
  const key = expertiseClassKey(feature);
  return [
    ...new Set(
      Object.entries(data.expertiseSkillKeysByClass ?? {})
        .filter(([classKey]) => classKey !== key)
        .flatMap(([, keys]) => keys)
    ),
  ];
}

/** Every skill doubled by a CLASS Expertise feature, across classes. */
export function getAllExpertiseSkillKeys(
  data: Pick<CharacterFormData, 'expertiseSkillKeysByClass'>
): string[] {
  return [...new Set(Object.values(data.expertiseSkillKeysByClass ?? {}).flat())];
}
