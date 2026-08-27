'use client';

import {
  getWeaponMasteryMaxForFeature,
  getWeaponMasteryPicks,
  getWeaponMasteryPicksFromOtherClasses,
  setWeaponMasteryPicks,
  type CharacterFormData,
} from '@rpgforce-ai/shared';
import type { FeatureDetail } from '../shared/types';
import { SkillChoiceFromListBlock } from '../shared/skill-choice-list';

interface WeaponMasteryPanelProps {
  data: CharacterFormData;
  onChange: (d: CharacterFormData) => void;
  /** The instance being edited: each granting class has its own count and its own picks. */
  feat: FeatureDetail;
  masteryWeapons: Array<{ id: string; name: string }>;
}

export function WeaponMasteryPanel({
  data,
  onChange,
  feat,
  masteryWeapons,
}: WeaponMasteryPanelProps) {
  if (masteryWeapons.length === 0) return null;
  return (
    <SkillChoiceFromListBlock
      selectionMode="multi"
      entries={masteryWeapons.map((w) => ({ key: w.id, label: w.name }))}
      selectedIds={getWeaponMasteryPicks(data, feat)}
      // Checked and disabled: what another class already mastered, so the same weapon is never
      // bought twice and the player can see where it came from.
      lockedIds={getWeaponMasteryPicksFromOtherClasses(data, feat)}
      maxSelections={getWeaponMasteryMaxForFeature(data, feat)}
      onChangeIds={(ids) => onChange({ ...data, ...setWeaponMasteryPicks(data, feat, ids) })}
    />
  );
}
