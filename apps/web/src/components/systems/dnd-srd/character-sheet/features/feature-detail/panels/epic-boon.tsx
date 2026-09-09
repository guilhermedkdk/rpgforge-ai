'use client';

import {
  canApplyEpicBoonChoices,
  EPIC_BOON_CAP,
  getEpicBoonPrerequisiteBlockedReasons,
  REPEATABLE_FEAT_NAMES,
  buildEffectiveAttributeScores,
  buildOwnedFeatIdsSet,
  evaluateFeatPrerequisite,
  getFeatMeta,
  isEpicBoonFeat,
  type RuleItemResponse,
  type CharacterFormData,
} from '@rpgforce-ai/shared';
import { ATTRIBUTES } from '../../../constants';
import { FeatOptionRowBody, RequirementAlert, SelectionSection } from '../shared/selection';
import { FeatureOptionRow } from '../shared/feature-option-row';
import { AbilityScoreIncreasePicker } from '../shared/ability-score-increase-picker';

interface EpicBoonPanelProps {
  data: CharacterFormData;
  onChange: (d: CharacterFormData) => void;
  featsList: RuleItemResponse[];
}

export function EpicBoonPanel({ data, onChange, featsList }: EpicBoonPanelProps) {
  const epicBoonPrerequisitesMet = canApplyEpicBoonChoices(data);
  const epicBoonBlockedReasons = getEpicBoonPrerequisiteBlockedReasons(data);
  const epicBoonFeats = featsList.filter(isEpicBoonFeat);
  if (epicBoonFeats.length === 0) return null;

  const currentEpicBoonId = data.epicBoonFeatId ?? null;
  const ownedFeatIdsSet = buildOwnedFeatIdsSet(data, featsList);
  const effectiveAttributeScores = buildEffectiveAttributeScores(data);

  return (
    <SelectionSection>
      {!epicBoonPrerequisitesMet && epicBoonBlockedReasons.length > 0 && (
        <RequirementAlert className="mb-3" reasons={epicBoonBlockedReasons} />
      )}

      <div
        className="max-h-80 space-y-2 overflow-y-auto pb-2 pr-1"
        role="list"
        aria-label="Epic Boon feats"
      >
        {epicBoonFeats.map((feat) => {
          const { prerequisite } = getFeatMeta(feat);
          const featNameLower = (feat.name ?? '').trim().toLowerCase();
          const isRepeatable = REPEATABLE_FEAT_NAMES.has(featNameLower);
          const isAlreadyOwnedNonRepeatable =
            !isRepeatable && ownedFeatIdsSet.has(feat.id) && feat.id !== currentEpicBoonId;
          const unmetPrerequisites = evaluateFeatPrerequisite(
            prerequisite,
            data,
            effectiveAttributeScores
          );
          const isMissingPrerequisites = unmetPrerequisites.length > 0;
          const isSelected = currentEpicBoonId === feat.id || isAlreadyOwnedNonRepeatable;
          // Once a boon is chosen, the others lock — deselect to switch (same rule as Expertise).
          const disabled =
            !epicBoonPrerequisitesMet ||
            isAlreadyOwnedNonRepeatable ||
            isMissingPrerequisites ||
            (currentEpicBoonId != null && currentEpicBoonId !== feat.id);
          return (
            <FeatureOptionRow
              key={feat.id}
              selected={isSelected}
              disabled={disabled}
              alignTop
              mark="check"
              onClick={() => {
                if (disabled) return;
                onChange({
                  ...data,
                  epicBoonFeatId: isSelected ? null : feat.id,
                  epicBoonAbilityScore: isSelected ? null : data.epicBoonAbilityScore,
                });
              }}
            >
              <FeatOptionRowBody feat={feat} />
            </FeatureOptionRow>
          );
        })}
      </div>

      {currentEpicBoonId ? (
        <SelectionSection density="tight">
          <AbilityScoreIncreasePicker
            attributes={ATTRIBUTES}
            selected={data.epicBoonAbilityScore ?? null}
            effectiveScores={effectiveAttributeScores}
            cap={EPIC_BOON_CAP}
            helperText="Choose one ability score to increase by 1 (max 30)."
            disabled={!epicBoonPrerequisitesMet}
            onSelect={(attr) => onChange({ ...data, epicBoonAbilityScore: attr })}
          />
        </SelectionSection>
      ) : null}
    </SelectionSection>
  );
}
