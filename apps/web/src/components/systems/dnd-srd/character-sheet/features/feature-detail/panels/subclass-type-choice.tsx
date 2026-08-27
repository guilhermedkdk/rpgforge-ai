'use client';

import type { CharacterFormData } from '@rpgforce-ai/shared';
import { SelectionSection } from '../shared/selection';
import { FeatureOptionRow } from '../shared/feature-option-row';
import type { FeatureDetail } from '../shared/types';

/**
 * Name-only option choice (Elemental Affinity, Fiendish Resilience, Circle of the Land):
 * a simple list with the same semantics as the option cards (selecting locks the others; clicking
 * the selected one clears it), writing to `raceTraitSelections[featureName]`.
 */
export function SubclassTypeChoicePanel({
  feat,
  data,
  onChange,
}: {
  feat: FeatureDetail;
  data: CharacterFormData;
  onChange: (d: CharacterFormData) => void;
}) {
  const opts = feat.options ?? [];
  if (opts.length < 2) return null;
  const featureName = feat.name;
  const selectedKey = data.raceTraitSelections?.[featureName] ?? null;

  return (
    <SelectionSection>
      <div className="max-h-64 space-y-2 overflow-y-auto pb-2 pr-1" role="list">
        {opts.map((option) => {
          const isSelected = selectedKey === option.key;
          const lockedByOther = selectedKey != null && selectedKey !== '' && !isSelected;
          return (
            <FeatureOptionRow
              key={option.key}
              selected={isSelected}
              disabled={lockedByOther}
              mark="check"
              onClick={
                lockedByOther
                  ? undefined
                  : () =>
                      onChange({
                        ...data,
                        raceTraitSelections: {
                          ...(data.raceTraitSelections ?? {}),
                          [featureName]: isSelected ? '' : option.key,
                        },
                      })
              }
            >
              <span className="text-xs font-medium text-foreground">{option.label}</span>
            </FeatureOptionRow>
          );
        })}
      </div>
    </SelectionSection>
  );
}
