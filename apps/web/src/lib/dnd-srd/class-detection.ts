/**
 * Single place for class / race-lineage identity checks used by the sheet UI.
 * Still name-based for now; when ingestion ships structured mechanics markers,
 * only this module needs to switch implementations.
 */
import type { RuleItemResponse } from '@rpgforce-ai/shared';
import type { CharacterFormData } from './character-state';

const normalizeName = (name: string | null | undefined): string => (name ?? '').trim().toLowerCase();

export const isWizardClassItem = (item: Pick<RuleItemResponse, 'name'> | null | undefined): boolean =>
  normalizeName(item?.name) === 'wizard';

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

const HIGH_ELF_LINEAGE_KEY = 'high-elf';

/** True when the sheet has the Elven Lineage race trait with the High Elf option selected. */
export const isHighElfLineageSelected = (
  data: Pick<CharacterFormData, 'featureDetails' | 'raceTraitSelections'>,
): boolean => {
  const feat = (data.featureDetails ?? []).find(
    (f) =>
      f.source === 'race' &&
      (f.featureKey === 'elven-lineage' || isElvenLineageFeatureName(f.name)),
  );
  if (!feat) return false;
  return (data.raceTraitSelections?.[feat.name] ?? null) === HIGH_ELF_LINEAGE_KEY;
};
