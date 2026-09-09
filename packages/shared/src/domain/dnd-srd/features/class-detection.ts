/**
 * Class / race-lineage / subclass identity checks. Shared so BOTH the web editor and the backend
 * save-time validation resolve identities identically. Still name-based where ingestion has no
 * structured marker yet; when markers ship, only this module switches implementations.
 */
import { extractSubclassOfKey } from '../options/character-options';
import { normalizeName } from '../util/text-utils';
import type { RuleItemResponse } from '../../../types/ruleitem';
import type { CharacterFormData } from '../character/character-form-data';

export const isWizardClassItem = (
  item: Pick<RuleItemResponse, 'name'> | null | undefined
): boolean => normalizeName(item?.name) === 'wizard';

export const isBardClassItem = (item: Pick<RuleItemResponse, 'name'> | null | undefined): boolean =>
  normalizeName(item?.name) === 'bard';

export const isElvenLineageFeatureName = (name: string): boolean => {
  const n = normalizeName(name);
  return n === 'elven lineage' || (n.includes('elven') && n.includes('lineage'));
};

export const isGnomishLineageFeatureName = (name: string): boolean => {
  const n = normalizeName(name);
  return n === 'gnomish lineage' || (n.includes('gnomish') && n.includes('lineage'));
};

export const isFiendishLegacyFeatureName = (name: string): boolean => {
  const n = normalizeName(name);
  return n === 'fiendish legacy' || (n.includes('fiendish') && n.includes('legacy'));
};

export const isOtherworldlyPresenceFeatureName = (name: string): boolean =>
  normalizeName(name) === 'otherworldly presence';

/** True when the SUBCLASS item belongs to the class (via `normalized.subclassOf.key`). */
export const isSubclassOfClass = (
  subclassItem: Pick<RuleItemResponse, 'normalized'>,
  classItem: Pick<RuleItemResponse, 'sourceKey'> | null | undefined
): boolean => {
  if (!classItem?.sourceKey) return false;
  return extractSubclassOfKey(subclassItem.normalized) === classItem.sourceKey;
};

const HIGH_ELF_LINEAGE_KEY = 'high-elf';

/** True when the sheet has the Elven Lineage race trait with the High Elf option selected. */
export const isHighElfLineageSelected = (
  data: Pick<CharacterFormData, 'featureDetails' | 'raceTraitSelections'>
): boolean => {
  const feat = (data.featureDetails ?? []).find(
    (f) =>
      f.source === 'race' && (f.featureKey === 'elven-lineage' || isElvenLineageFeatureName(f.name))
  );
  if (!feat) return false;
  return (data.raceTraitSelections?.[feat.name] ?? null) === HIGH_ELF_LINEAGE_KEY;
};
