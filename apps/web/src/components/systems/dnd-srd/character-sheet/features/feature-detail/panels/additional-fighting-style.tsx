'use client';

import {
  buildEffectiveAttributeScores,
  buildOwnedFeatIdsSet,
  evaluateFeatPrerequisite,
  getFeatMeta,
  isFightingStyleFeat,
  type RuleItemResponse,
  type CharacterFormData,
} from '@rpgforce-ai/shared';
import { FeatOptionRowBody, SelectionSection } from '../shared/selection';
import { FeatureOptionRow } from '../shared/feature-option-row';

/**
 * Additional Fighting Style (Champion): one more Fighting Style feat. Same pattern as the other
 * feat selectors (Versatile / Epic Boon): styles the character already has from another source
 * appear checked and locked, and choosing one locks the others (deselect to swap).
 */
export function AdditionalFightingStylePanel({
  data,
  onChange,
  featsList,
}: {
  data: CharacterFormData;
  onChange: (d: CharacterFormData) => void;
  featsList: RuleItemResponse[];
}) {
  const fightingStyleFeats = featsList.filter(isFightingStyleFeat);
  if (fightingStyleFeats.length === 0) return null;

  const selectedFeatId = data.additionalFightingStyleFeatId ?? '';
  const ownedFeatIdsSet = buildOwnedFeatIdsSet(data, featsList);
  const effectiveAttributeScores = buildEffectiveAttributeScores(data);
  const featureNamesLower = new Set(
    (data.featureDetails ?? []).map((fd) => fd.name.trim().toLowerCase()),
  );

  return (
    <SelectionSection>
      <div
        className="max-h-80 space-y-2 overflow-y-auto pb-2 pr-1"
        role="list"
        aria-label="Fighting Style feats"
      >
        {fightingStyleFeats.map((f) => {
          const { prerequisite } = getFeatMeta(f);
          const isAlreadyOwned = ownedFeatIdsSet.has(f.id) && f.id !== selectedFeatId;
          const unmetPrerequisites = evaluateFeatPrerequisite(
            prerequisite,
            data,
            effectiveAttributeScores,
            featureNamesLower,
          );
          const isSelected = selectedFeatId === f.id || isAlreadyOwned;
          const isDisabled =
            isAlreadyOwned ||
            unmetPrerequisites.length > 0 ||
            (selectedFeatId !== '' && selectedFeatId !== f.id);
          return (
            <FeatureOptionRow
              key={f.id}
              selected={isSelected}
              disabled={isDisabled}
              alignTop
              mark="check"
              onClick={() => {
                if (isDisabled) return;
                onChange({
                  ...data,
                  additionalFightingStyleFeatId: isSelected ? null : f.id,
                });
              }}
            >
              <FeatOptionRowBody feat={f} />
            </FeatureOptionRow>
          );
        })}
      </div>
    </SelectionSection>
  );
}
