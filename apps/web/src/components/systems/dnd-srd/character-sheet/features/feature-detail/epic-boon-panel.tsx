'use client';

import type { RuleItemResponse } from '@rpgforce-ai/shared';
import type { CharacterFormData } from '@/lib/dnd-srd/character-state';
import {
  canApplyEpicBoonChoices,
  EPIC_BOON_CAP,
  getEpicBoonPrerequisiteBlockedReasons,
} from '@/lib/dnd-srd/character-state';
import { ATTRIBUTES } from '../../constants';
import {
  REPEATABLE_FEAT_NAMES,
  buildEffectiveAttributeScores,
  buildOwnedFeatIdsSet,
  evaluateFeatPrerequisite,
  getFeatMeta,
} from '@/lib/dnd-srd/feat-prerequisites';
import {
  FEATURE_DETAIL_OPTION_BODY_STACK,
  RequirementAlert,
  SelectionSection,
} from './feature-detail-primitives';
import { FeatureOptionRow } from './feature-selection-row';
import { AbilityScoreIncreasePicker } from './ability-score-increase-picker';

interface EpicBoonPanelProps {
  data: CharacterFormData;
  onChange: (d: CharacterFormData) => void;
  featsList: RuleItemResponse[];
}

export function EpicBoonPanel({ data, onChange, featsList }: EpicBoonPanelProps) {
  const epicBoonPrerequisitesMet = canApplyEpicBoonChoices(data);
  const epicBoonBlockedReasons = getEpicBoonPrerequisiteBlockedReasons(data);
  const epicBoonFeats = featsList.filter((f) => {
    const raw = (f.normalized ?? f.raw ?? {}) as { type?: string | null };
    const type = (raw.type ?? (f.raw as Record<string, unknown>)?.type ?? '') as string;
    return type?.toLowerCase() === 'epic boon';
  });
  if (epicBoonFeats.length === 0) return null;

  const currentEpicBoonId = data.epicBoonFeatId ?? null;
  const ownedFeatIdsSet = buildOwnedFeatIdsSet(data, featsList);
  const effectiveAttributeScores = buildEffectiveAttributeScores(data);

  return (
    <SelectionSection>
      {!epicBoonPrerequisitesMet && epicBoonBlockedReasons.length > 0 && (
        <RequirementAlert className="mb-3" reasons={epicBoonBlockedReasons} />
      )}

      <div className="max-h-[min(52vh,380px)] space-y-2 overflow-y-auto pb-2 pr-1">
        {epicBoonFeats.map((feat) => {
          const { benefitDescs, prerequisite } = getFeatMeta(feat);
          const featNameLower = (feat.name ?? '').trim().toLowerCase();
          const isRepeatable = REPEATABLE_FEAT_NAMES.has(featNameLower);
          const isAlreadyOwnedNonRepeatable =
            !isRepeatable && ownedFeatIdsSet.has(feat.id) && feat.id !== currentEpicBoonId;
          const unmetPrerequisites = evaluateFeatPrerequisite(
            prerequisite,
            data,
            effectiveAttributeScores,
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
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-foreground">{feat.name}</span>
                {prerequisite ? (
                  <span className="text-xs text-muted-foreground">
                    <span className="font-medium">Prerequisite:</span> {prerequisite}
                  </span>
                ) : null}
                {benefitDescs.length > 0 ? (
                  <div className={FEATURE_DETAIL_OPTION_BODY_STACK}>
                    {benefitDescs.map((desc, idx) => (
                      <span key={idx} className="whitespace-pre-line text-xs text-muted-foreground">
                        {desc}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
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
