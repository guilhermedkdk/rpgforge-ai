'use client';

import * as React from 'react';
import { Plus, Minus, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { RuleItemResponse } from '@rpgforce-ai/shared';
import type { AbilityScoreImprovementGainChoice, CharacterFormData } from '@/lib/dnd-srd/character-state';
import {
  reconcileMagicInitiateChoices,
  reconcileSkilledChoices,
} from '@/lib/dnd-srd/derived-character-stats';
import {
  canApplyAbilityScoreImprovementASI,
  getAbilityScoreImprovementASIBlockedReasons,
  maxIncreaseScoresOnAttributeForGain,
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
  FEATURE_DETAIL_OPTION_BODY_RULE_SINGLE,
  FEATURE_DETAIL_OPTION_BODY_STACK,
  RequirementAlert,
  SelectionSection,
} from './feature-detail-primitives';
import { FeatureOptionRow } from './feature-selection-row';

interface AbilityScoreImprovementPanelProps {
  data: CharacterFormData;
  onChange: (d: CharacterFormData) => void;
  featsList: RuleItemResponse[];
  gainCount: number;
  gainedAtLevels?: number[];
}

export function AbilityScoreImprovementPanel({
  data,
  onChange,
  featsList,
  gainCount,
  gainedAtLevels,
}: AbilityScoreImprovementPanelProps) {
  const [pageIndex, setPageIndex] = React.useState(0);
  const levelsKey = gainedAtLevels?.join(',') ?? '';
  React.useEffect(() => {
    setPageIndex(0);
  }, [gainCount, data.level, levelsKey]);

  const safeGainCount = Math.max(1, gainCount);
  React.useEffect(() => {
    if (pageIndex >= safeGainCount) {
      setPageIndex(Math.max(0, safeGainCount - 1));
    }
  }, [safeGainCount, pageIndex]);

  const slotIndex = Math.min(pageIndex, safeGainCount - 1);
  const showPager = safeGainCount > 1;
  const levelForSlot = gainedAtLevels?.[slotIndex];

  const ensureByGain = (d: CharacterFormData, n: number): AbilityScoreImprovementGainChoice[] =>
    Array.from({ length: n }, (_, i) => (d.abilityScoreImprovementByGain ?? [])[i] ?? null);

  const byGain = ensureByGain(data, safeGainCount);
  const asiPrerequisitesMet = canApplyAbilityScoreImprovementASI(data);
  const asiBlockedReasons = getAbilityScoreImprovementASIBlockedReasons(data);

  const patchGain = (index: number, choice: AbilityScoreImprovementGainChoice) => {
    const next = ensureByGain(data, safeGainCount);
    next[index] = choice;

    // Changing an ASI choice can add/remove a Magic Initiate or Skilled source — the shared
    // reconcilers prune each store to the active sources and reset what was removed.
    const nextData: CharacterFormData = { ...data, abilityScoreImprovementByGain: next };
    onChange({
      ...nextData,
      ...reconcileMagicInitiateChoices(nextData, featsList),
      ...reconcileSkilledChoices(nextData, featsList),
    });
  };

  const choice = byGain[slotIndex];
  const isFeat = choice?.kind === 'feat';
  const isScores = !isFeat;
  const selectedFeatIdForCurrentSlot = isFeat && choice ? choice.featId : '';
  const ownedFeatIdsSet = buildOwnedFeatIdsSet(data, featsList);
  const effectiveAttributeScores = buildEffectiveAttributeScores(data);

  const availableFeats = featsList.filter((f) => {
    const raw = (f.normalized ?? f.raw ?? {}) as { type?: string | null };
    const type = ((raw.type ?? (f.raw as Record<string, unknown> | undefined)?.type ?? '') as string)
      .trim()
      .toLowerCase();
    const nameLower = (f.name ?? '').trim().toLowerCase();
    return type !== 'epic boon' && type !== 'fighting style' && nameLower !== 'ability score improvement';
  });

  const slotMap: Record<string, number> = isScores && choice ? { ...choice.byAbility } : {};
  const slotTotal = ATTRIBUTES.reduce((s, a) => s + (slotMap[a] ?? 0), 0);
  const byGainForCap: AbilityScoreImprovementGainChoice[] = Array.from(
    { length: safeGainCount },
    (_, i) => {
      if (i === slotIndex) return { kind: 'increase_scores', byAbility: { ...slotMap } };
      return byGain[i] ?? null;
    },
  );

  return (
    <SelectionSection>
      {showPager && (
        <div className="mb-3 flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-muted/20 px-2 py-2">
          <button
            type="button"
            aria-label="Previous improvement"
            disabled={slotIndex <= 0}
            onClick={() => setPageIndex((i) => Math.max(0, i - 1))}
            className={cn(
              'flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-background text-foreground transition-colors',
              slotIndex <= 0 ? 'cursor-not-allowed opacity-40' : 'cursor-pointer hover:bg-muted/60',
            )}
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </button>
          <div className="min-w-0 flex-1 text-center">
            <p className="text-xs font-semibold text-foreground">
              {levelForSlot != null ? `Level ${levelForSlot}` : `Improvement ${slotIndex + 1}`}
            </p>
          </div>
          <button
            type="button"
            aria-label="Next improvement"
            disabled={slotIndex >= safeGainCount - 1}
            onClick={() => setPageIndex((i) => Math.min(safeGainCount - 1, i + 1))}
            className={cn(
              'flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-background text-foreground transition-colors',
              slotIndex >= safeGainCount - 1
                ? 'cursor-not-allowed opacity-40'
                : 'cursor-pointer hover:bg-muted/60',
            )}
          >
            <ChevronRight className="h-4 w-4" aria-hidden />
          </button>
        </div>
      )}

      <div className="rounded-lg border border-border/60 bg-muted/10 p-3">
        {!showPager && levelForSlot == null && (
          <p className="mb-2 text-xs font-semibold text-foreground">This improvement</p>
        )}
        <div className="mb-3 flex overflow-hidden rounded-lg border border-border">
          <button
            type="button"
            onClick={() => patchGain(slotIndex, { kind: 'increase_scores', byAbility: {} })}
            className={cn(
              'flex flex-1 items-center justify-center py-2 text-xs font-medium transition-colors focus:outline-none',
              'cursor-pointer',
              isScores && asiPrerequisitesMet
                ? 'bg-primary/15 text-primary'
                : isScores && !asiPrerequisitesMet
                  ? 'bg-destructive/10 text-destructive'
                  : 'bg-background text-muted-foreground hover:bg-muted/50',
            )}
            aria-pressed={isScores}
          >
            Increase Scores
          </button>
          <div className="w-px bg-border" aria-hidden />
          <button
            type="button"
            onClick={() => patchGain(slotIndex, { kind: 'feat', featId: '' })}
            className={cn(
              'flex flex-1 cursor-pointer items-center justify-center py-2 text-xs font-medium transition-colors focus:outline-none',
              isFeat
                ? 'bg-primary/15 text-primary'
                : 'bg-background text-muted-foreground hover:bg-muted/50',
            )}
            aria-pressed={isFeat}
          >
            Choose Feat
          </button>
        </div>

        {isScores && (
          <div>
            {!asiPrerequisitesMet && (
              <RequirementAlert className="mb-3" reasons={asiBlockedReasons} />
            )}
            <p className="mb-2 text-xs text-muted-foreground">
              Increase one ability score of your choice by 2, or increase two ability scores of your
              choice by 1. This feature cannot raise an ability score above 20.
            </p>
            <ul
              className="list-none pl-0! [&>li]:mb-1! [&>li:last-child]:mb-0!"
              role="list"
              aria-label={`Ability score improvement ${slotIndex + 1}`}
            >
              {ATTRIBUTES.map((attr) => {
                const current = slotMap[attr] ?? 0;
                const canDecrease = current > 0;
                const maxFromCap = maxIncreaseScoresOnAttributeForGain(
                  data,
                  attr,
                  byGainForCap,
                  slotIndex,
                );
                const canIncrease =
                  asiPrerequisitesMet && slotTotal < 2 && current < 2 && current < maxFromCap;
                const bump = (delta: number) => {
                  if (!asiPrerequisitesMet) return;
                  const nextSlot = { ...slotMap, [attr]: current + delta };
                  if (nextSlot[attr] <= 0) delete nextSlot[attr];
                  patchGain(slotIndex, { kind: 'increase_scores', byAbility: nextSlot });
                };
                const effectiveScore = effectiveAttributeScores[attr] ?? 0;
                return (
                  <li
                    key={attr}
                    className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-muted/20 px-2 py-1.5"
                    role="listitem"
                  >
                    <span className="min-w-0 truncate text-xs font-medium text-foreground">
                      {attr}
                    </span>
                    <div
                      className="flex shrink-0 items-center gap-1"
                      role="group"
                      aria-label={`Bonus for ${attr}`}
                    >
                      <button
                        type="button"
                        onClick={() => bump(-1)}
                        disabled={!canDecrease}
                        className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-full border-2 border-border bg-card text-foreground transition-colors hover:border-primary hover:bg-primary/10 hover:text-primary disabled:cursor-not-allowed disabled:opacity-30"
                        aria-label={`Decrease ${attr} bonus`}
                      >
                        <Minus className="h-3 w-3" strokeWidth={2.5} aria-hidden />
                      </button>
                      <span
                        className={cn(
                          'flex h-7 min-w-10 items-center justify-center rounded-full border-2 px-2 text-xs font-bold tabular-nums',
                          current > 0
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border bg-card text-foreground',
                        )}
                      >
                        {effectiveScore}
                      </span>
                      <button
                        type="button"
                        onClick={() => bump(1)}
                        disabled={!canIncrease}
                        className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-full border-2 border-border bg-card text-foreground transition-colors hover:border-primary hover:bg-primary/10 hover:text-primary disabled:cursor-not-allowed disabled:opacity-30"
                        aria-label={`Increase ${attr} bonus`}
                      >
                        <Plus className="h-3 w-3" strokeWidth={2.5} aria-hidden />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {isFeat && availableFeats.length > 0 && (
          <div>
            <p className="mb-3 text-xs text-muted-foreground">
              Choose one feat for this improvement. Some feats have prerequisites, and some can be
              taken more than once.
            </p>
            <div
              className="max-h-80 space-y-2 overflow-y-auto pb-2 pr-1"
              role="list"
              aria-label="Available feats"
            >
              {availableFeats.map((feat) => {
                const { benefitDescs, prerequisite } = getFeatMeta(feat);
                const descFallback = String(
                  ((feat.normalized ?? {}) as Record<string, unknown>).desc ??
                    ((feat.raw ?? {}) as Record<string, unknown>).desc ??
                    feat.contentMd ??
                    '',
                );
                const featNameLower = (feat.name ?? '').trim().toLowerCase();
                const isRepeatableFeat = REPEATABLE_FEAT_NAMES.has(featNameLower);
                const isAlreadyOwnedNonRepeatable =
                  !isRepeatableFeat &&
                  ownedFeatIdsSet.has(feat.id) &&
                  feat.id !== selectedFeatIdForCurrentSlot;
                const unmetPrerequisites = evaluateFeatPrerequisite(
                  prerequisite,
                  data,
                  effectiveAttributeScores,
                );
                const isMissingPrerequisites = unmetPrerequisites.length > 0;
                const selectedId = isFeat && choice ? choice.featId : '';
                const isSelected = selectedId === feat.id || isAlreadyOwnedNonRepeatable;
                // Once this slot holds a feat, the other options lock — deselect the current one to
                // switch. Same "max reached" rule as Expertise and the other selectors on the sheet.
                const slotHasFeat = selectedId !== '';
                const isDisabled =
                  isAlreadyOwnedNonRepeatable ||
                  isMissingPrerequisites ||
                  (slotHasFeat && selectedId !== feat.id);
                return (
                  <FeatureOptionRow
                    key={feat.id}
                    selected={isSelected}
                    disabled={isDisabled}
                    alignTop
                    mark="check"
                    onClick={() => {
                      if (isDisabled) return;
                      patchGain(slotIndex, {
                        kind: 'feat',
                        featId: isSelected ? '' : feat.id,
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
                            <span
                              key={idx}
                              className="whitespace-pre-line text-xs text-muted-foreground"
                            >
                              {desc}
                            </span>
                          ))}
                        </div>
                      ) : descFallback ? (
                        <span
                          className={cn(
                            FEATURE_DETAIL_OPTION_BODY_RULE_SINGLE,
                            'whitespace-pre-line text-xs text-muted-foreground',
                          )}
                        >
                          {descFallback}
                        </span>
                      ) : null}
                    </div>
                  </FeatureOptionRow>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </SelectionSection>
  );
}
