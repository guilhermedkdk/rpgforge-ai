'use client';

import {
  getPrimalChampionBodyAndMindBonusBlockedReasons,
  getPrimalChampionBodyAndMindBonusFlags,
  type CharacterFormData,
} from '@rpgforce-ai/shared';
import { RequirementAlert, SelectionSection } from '../shared/selection';
import type { FeatureDetail } from '../shared/types';

interface PrimalChampionWarningProps {
  data: CharacterFormData;
  feat: FeatureDetail;
}

export function PrimalChampionWarning({ data, feat }: PrimalChampionWarningProps) {
  const name = feat.name.trim().toLowerCase();
  const isPrimalChampion = name === 'primal champion';
  const isBodyAndMind = name === 'body and mind';
  if (!isPrimalChampion && !isBodyAndMind) return null;

  const { hasPrimalChampion, hasBodyAndMind } = getPrimalChampionBodyAndMindBonusFlags(data);
  const bonusesActive = isPrimalChampion ? hasPrimalChampion : hasBodyAndMind;
  if (bonusesActive) return null;

  const blockedReasons = getPrimalChampionBodyAndMindBonusBlockedReasons(data);
  return (
    <SelectionSection>
      <RequirementAlert
        className="mb-3"
        reasons={blockedReasons}
        fallbackText="Finish outstanding prerequisites on the character sheet."
      />
    </SelectionSection>
  );
}
