'use client';

import type { RuleItemResponse } from '@rpgforce-ai/shared';
import type { CharacterFormData } from '@/lib/dnd-srd/character-state';
import {
  reconcileMagicInitiateChoices,
  reconcileSkilledChoices,
} from '@/lib/dnd-srd/derived-character-stats';
import {
  REPEATABLE_FEAT_NAMES,
  buildEffectiveAttributeScores,
  buildOwnedFeatIdsSet,
  evaluateFeatPrerequisite,
  getFeatMeta,
} from '@/lib/dnd-srd/feat-prerequisites';
import {
  FEATURE_DETAIL_OPTION_BODY_STACK,
  SelectionSection,
} from './feature-detail-primitives';
import { FeatureOptionRow } from './feature-selection-row';

interface VersatilePanelProps {
  data: CharacterFormData;
  onChange: (d: CharacterFormData) => void;
  featsList: RuleItemResponse[];
}

export function VersatilePanel({ data, onChange, featsList }: VersatilePanelProps) {
  const originFeats = featsList.filter((f) => {
    const raw = (f.normalized ?? f.raw ?? {}) as { type?: string | null };
    const type = (raw.type ?? (f.raw as Record<string, unknown>)?.type ?? '') as string;
    return type?.toLowerCase() === 'origin';
  });
  if (originFeats.length === 0) return null;

  const selectedFeatIdForSlot = data.versatileFeatId ?? '';
  const ownedFeatIdsSet = buildOwnedFeatIdsSet(data, featsList);
  const effectiveAttributeScores = buildEffectiveAttributeScores(data);
  const featureNamesLower = new Set(
    (data.featureDetails ?? []).map((fd) => fd.name.trim().toLowerCase()),
  );

  return (
    <SelectionSection>
      <p className="mb-3 text-xs text-muted-foreground">
        Choose one origin feat. Some feats have prerequisites, and some can be taken more than once.
      </p>
      <p className="mb-3 text-xs text-muted-foreground">
        Feats you already have are shown as pre-filled and locked. Only Magic Initiate and Skilled can
        be selected more than once.
      </p>
      <div className="max-h-80 space-y-2 overflow-y-auto pb-2 pr-1" role="list" aria-label="Origin feats">
        {originFeats.map((feat) => {
          const { benefitDescs, prerequisite } = getFeatMeta(feat);
          const featNameLower = (feat.name ?? '').trim().toLowerCase();
          const isRepeatableFeat = REPEATABLE_FEAT_NAMES.has(featNameLower);
          const isAlreadyOwnedNonRepeatable =
            !isRepeatableFeat &&
            ownedFeatIdsSet.has(feat.id) &&
            feat.id !== selectedFeatIdForSlot;
          const unmetPrerequisites = evaluateFeatPrerequisite(
            prerequisite,
            data,
            effectiveAttributeScores,
            featureNamesLower,
          );
          const isMissingPrerequisites = unmetPrerequisites.length > 0;
          const isSelected = selectedFeatIdForSlot === feat.id || isAlreadyOwnedNonRepeatable;
          // Once a feat is chosen, the others lock — deselect to switch (same rule as Expertise).
          const isDisabled =
            isAlreadyOwnedNonRepeatable ||
            isMissingPrerequisites ||
            (selectedFeatIdForSlot !== '' && selectedFeatIdForSlot !== feat.id);
          return (
            <FeatureOptionRow
              key={feat.id}
              selected={isSelected}
              disabled={isDisabled}
              alignTop
              mark="check"
              onClick={() => {
                if (isDisabled) return;
                const newFeatId = isSelected ? null : feat.id;
                // Picking/clearing a Versatile feat can add/remove a Magic Initiate or Skilled
                // source — the shared reconcilers prune each store and reset what was removed.
                const nextData: CharacterFormData = { ...data, versatileFeatId: newFeatId };
                onChange({
                  ...nextData,
                  ...reconcileMagicInitiateChoices(nextData, featsList),
                  ...reconcileSkilledChoices(nextData, featsList),
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
    </SelectionSection>
  );
}
