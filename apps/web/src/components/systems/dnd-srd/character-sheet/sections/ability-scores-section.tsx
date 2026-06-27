'use client';

import { useState } from 'react';
import { Brain, Plus, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  getEffectiveAttribute,
  isPointBuyAbilityDistributionComplete,
  isStandardArrayAbilityDistributionComplete,
  POINT_BUY_BUDGET,
  POINT_BUY_COSTS,
  POINT_BUY_MIN,
} from '@/lib/dnd-srd/character-state';
import { useCharacterComputed } from '../context';
import { Section } from '../ui/section';
import { AbilityScoreBox } from '../ui/ability-score-box';
import { updateAttribute } from '../helpers';
import { ATTRIBUTES, needsChoiceHighlight } from '../constants';
import type { CharacterFormData } from '../types';

interface AbilityScoresSectionProps {
  data: CharacterFormData;
  onChange: (data: CharacterFormData) => void;
  readOnly?: boolean;
  saveAttempted?: boolean;
}

export function AbilityScoresSection({
  data,
  onChange,
  readOnly = false,
  saveAttempted = false,
}: AbilityScoresSectionProps) {
  const {
    abilityMethod,
    handleSetAbilityMethod,
    combinedAbilityBonuses,
    effectiveEpicBoonAbilityScore,
    hasPrimalChampion,
    hasBodyAndMind,
  } = useCharacterComputed();

  const [attributesChoiceAcknowledged, setAttributesChoiceAcknowledged] = useState(false);

  const method = abilityMethod;
  const assignedScores = ATTRIBUTES.map((a) => data.attributes[a] ?? 0).filter((v) => v > 0);
  const pointsSpent = ATTRIBUTES.reduce((sum, a) => {
    const s = data.attributes[a] ?? POINT_BUY_MIN;
    return sum + (POINT_BUY_COSTS[s] ?? 0);
  }, 0);
  const pointsRemaining = POINT_BUY_BUDGET - pointsSpent;
  const hasBackgroundSelected =
    (data.background ?? '').trim() !== '' || data.backgroundRuleItemId != null;

  const bgAbilityOpt = data.backgroundAbilityScoreOption;
  const backgroundBonusPointsSpent = (() => {
    if (!bgAbilityOpt) return 0;
    const attrs =
      bgAbilityOpt.allowedAbilityNames.length > 0
        ? bgAbilityOpt.allowedAbilityNames
        : (ATTRIBUTES as unknown as string[]);
    return attrs.reduce((s, a) => s + (data.backgroundAbilityScoreIncrease?.[a] ?? 0), 0);
  })();
  /** Same idea as Skills: stay highlighted until every background bonus point is placed. */
  const needsBackgroundAbilityBonuses =
    hasBackgroundSelected &&
    bgAbilityOpt != null &&
    backgroundBonusPointsSpent < bgAbilityOpt.totalPoints;

  const baseAbilityDistributionComplete =
    method === 'point-buy'
      ? isPointBuyAbilityDistributionComplete(data.attributes ?? {})
      : isStandardArrayAbilityDistributionComplete(data.attributes ?? {});

  const showAttributesSetupCue =
    !readOnly && (!attributesChoiceAcknowledged || needsBackgroundAbilityBonuses);

  // After a blocked save, the trigger turns red while the distribution is actually incomplete.
  const attributesError =
    saveAttempted && (!baseAbilityDistributionComplete || needsBackgroundAbilityBonuses);

  return (
    <div className="flex min-h-0 min-w-0 flex-col gap-3 lg:h-full">
      <Section
        icon={null}
        title={
          <div className="flex items-center gap-1">
            <span className="text-primary">
              <Brain className="h-4 w-4" />
            </span>
            {readOnly ? (
              <span className="font-serif border border-transparent bg-transparent px-1 pt-1.5 pb-1 text-sm font-semibold uppercase tracking-wider leading-tight text-muted-foreground">
                Attributes
              </span>
            ) : (
              <DropdownMenu
                onOpenChange={(open) => {
                  if (open) setAttributesChoiceAcknowledged(true);
                }}
              >
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className={cn(
                      'font-serif text-sm font-semibold uppercase tracking-wider leading-tight cursor-pointer transition-colors rounded-md border pt-1.5 pb-1 px-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      attributesError
                        ? needsChoiceHighlight(true)
                        : showAttributesSetupCue
                          ? needsChoiceHighlight(false)
                          : 'border-transparent bg-transparent text-muted-foreground hover:text-foreground'
                    )}
                    aria-label="How to distribute attributes"
                  >
                    Attributes
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                align="start"
                side="right"
                className="min-w-0 p-0"
                sideOffset={6}
              >
                <div
                  className={cn(
                    'flex max-h-[85vh]',
                    hasBackgroundSelected ? 'w-[520px]' : 'min-w-[272px] max-w-[300px]'
                  )}
                >
                  <div
                    className={cn(
                      'flex min-w-0 flex-col p-3',
                      hasBackgroundSelected
                        ? 'min-w-[280px] flex-[1.4] border-r border-border'
                        : 'flex-1'
                    )}
                  >
                    <p className="mb-2 text-sm font-medium text-foreground">Point Distribution</p>
                    <p className="mb-4 text-xs text-muted-foreground">
                      Choose one of the methods. Each determines how you set Strength, Dexterity,
                      Constitution, Intelligence, Wisdom, and Charisma.
                    </p>
                    <div className="mb-3 flex overflow-hidden rounded-lg border border-border">
                      <button
                        type="button"
                        onClick={() => handleSetAbilityMethod('standard-array')}
                        className={cn(
                          'flex flex-1 cursor-pointer items-center justify-center py-2 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
                          abilityMethod === 'standard-array'
                            ? 'bg-primary/15 text-primary'
                            : 'bg-background text-muted-foreground hover:bg-muted/50'
                        )}
                        aria-pressed={abilityMethod === 'standard-array'}
                      >
                        Standard Array
                      </button>
                      <div className="w-px shrink-0 bg-border" aria-hidden />
                      <button
                        type="button"
                        onClick={() => handleSetAbilityMethod('point-buy')}
                        className={cn(
                          'flex flex-1 cursor-pointer items-center justify-center py-2 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
                          abilityMethod === 'point-buy'
                            ? 'bg-primary/15 text-primary'
                            : 'bg-background text-muted-foreground hover:bg-muted/50'
                        )}
                        aria-pressed={abilityMethod === 'point-buy'}
                      >
                        Point Buy
                      </button>
                    </div>
                    <div className="rounded-lg border border-border bg-muted/30 p-3">
                      {abilityMethod === 'standard-array' ? (
                        <p className="text-xs text-muted-foreground">
                          You have six fixed scores to assign across your six abilities: 15, 14, 13,
                          12, 10, and 8. Each ability takes exactly one of those numbers, and each
                          number is used only once. Open the menu under each score until every value
                          is placed.
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          You have 27 points to spend across your six abilities. Each one starts at
                          8, and you can raise any score up to 15. Raising a score costs more points
                          the higher it becomes. Use the +/− controls until you have spent your full
                          budget.
                        </p>
                      )}
                    </div>
                  </div>
                  {hasBackgroundSelected && (
                    <>
                      <div className="flex min-w-0 flex-1 flex-col p-3">
                        <p className="mb-2 text-sm font-medium text-foreground">
                          Background Ability Bonuses
                        </p>
                        {data.backgroundAbilityScoreOption ? (
                          <>
                            <p className="mb-3 text-xs text-muted-foreground">
                              Your background grants {data.backgroundAbilityScoreOption.totalPoints}{' '}
                              point
                              {data.backgroundAbilityScoreOption.totalPoints !== 1 ? 's' : ''} to
                              increase abilities (max.{' '}
                              {data.backgroundAbilityScoreOption.maxPerAbility} per ability).
                            </p>
                            {!baseAbilityDistributionComplete ? (
                              <div
                                className="mb-3 rounded-md border border-destructive/40 bg-destructive/10 px-2 py-2 text-xs text-destructive"
                                role="status"
                              >
                                <p className="font-semibold text-destructive">
                                  Requirements not met
                                </p>
                                <p className="mt-1 text-destructive/90">
                                  Finish your six base ability scores (Point Buy or Standard Array)
                                  before spending background bonus points.
                                </p>
                              </div>
                            ) : null}
                            <div className="rounded-lg border border-border bg-muted/30 p-3">
                              <div className="space-y-2">
                                {(data.backgroundAbilityScoreOption.allowedAbilityNames.length > 0
                                  ? data.backgroundAbilityScoreOption.allowedAbilityNames
                                  : (ATTRIBUTES as unknown as string[])
                                ).map((attr) => {
                                  const current = data.backgroundAbilityScoreIncrease?.[attr] ?? 0;
                                  const max = data.backgroundAbilityScoreOption!.maxPerAbility;
                                  const totalSpent = (
                                    data.backgroundAbilityScoreOption!.allowedAbilityNames.length >
                                    0
                                      ? data.backgroundAbilityScoreOption!.allowedAbilityNames
                                      : (ATTRIBUTES as unknown as string[])
                                  ).reduce(
                                    (s, a) => s + (data.backgroundAbilityScoreIncrease?.[a] ?? 0),
                                    0
                                  );
                                  const canDecrease = current > 0;
                                  const canIncrease =
                                    baseAbilityDistributionComplete &&
                                    current < max &&
                                    totalSpent - current + (current + 1) <=
                                      data.backgroundAbilityScoreOption!.totalPoints;
                                  const handleDecrease = () => {
                                    if (!canDecrease) return;
                                    const next = {
                                      ...(data.backgroundAbilityScoreIncrease ?? {}),
                                      [attr]: current - 1,
                                    };
                                    onChange({
                                      ...data,
                                      backgroundAbilityScoreIncrease: next,
                                    });
                                  };
                                  const handleIncrease = () => {
                                    if (!canIncrease) return;
                                    const next = {
                                      ...(data.backgroundAbilityScoreIncrease ?? {}),
                                      [attr]: current + 1,
                                    };
                                    onChange({
                                      ...data,
                                      backgroundAbilityScoreIncrease: next,
                                    });
                                  };
                                  return (
                                    <div
                                      key={attr}
                                      className="flex items-center justify-between gap-2"
                                    >
                                      <span className="text-xs text-foreground min-w-0 truncate">
                                        {attr}
                                      </span>
                                      <div
                                        className="flex shrink-0 items-center gap-0.5"
                                        role="group"
                                        aria-label={`${attr} bonus`}
                                      >
                                        <button
                                          type="button"
                                          onClick={handleDecrease}
                                          disabled={!canDecrease}
                                          className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-full border-2 border-border bg-card text-foreground transition-colors hover:border-primary hover:bg-primary/10 hover:text-primary disabled:cursor-not-allowed disabled:opacity-30 [&_svg]:shrink-0"
                                          aria-label={`Decrease bonus ${attr}`}
                                        >
                                          <Minus
                                            className="h-3.5 w-3.5"
                                            strokeWidth={2.5}
                                            aria-hidden
                                          />
                                        </button>
                                        <span className="flex h-7 min-w-8 items-center justify-center rounded-full border-2 border-border bg-card px-1.5 text-xs font-bold text-foreground">
                                          +{current}
                                        </span>
                                        <button
                                          type="button"
                                          onClick={handleIncrease}
                                          disabled={!canIncrease}
                                          className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-full border-2 border-border bg-card text-foreground transition-colors hover:border-primary hover:bg-primary/10 hover:text-primary disabled:cursor-not-allowed disabled:opacity-30 [&_svg]:shrink-0"
                                          aria-label={`Increase bonus ${attr}`}
                                        >
                                          <Plus
                                            className="h-3.5 w-3.5"
                                            strokeWidth={2.5}
                                            aria-hidden
                                          />
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </>
                        ) : (
                          <p className="text-xs text-muted-foreground">
                            Your background does not grant ability score bonuses to distribute.
                          </p>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        }
        className="flex min-h-0 flex-1 flex-col"
      >
        <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col">
          {!readOnly && method === 'point-buy' && (
            <div className="mb-3 flex w-full min-w-0 items-center justify-between gap-3 rounded-md bg-secondary/40 px-3 py-2.5 sm:px-4">
              <span className="shrink-0 text-xs text-muted-foreground">Points</span>
              <span
                className={cn(
                  'shrink-0 text-sm font-bold tabular-nums',
                  pointsRemaining === 0
                    ? 'text-primary'
                    : pointsRemaining < 0
                      ? 'text-destructive'
                      : 'text-foreground'
                )}
              >
                {pointsRemaining}
              </span>
            </div>
          )}

          <div className="flex min-h-0 flex-1 flex-col items-center justify-between pt-2 pb-4">
            {ATTRIBUTES.map((attr) => {
              const baseScore =
                data.attributes[attr] ?? (method === 'point-buy' ? POINT_BUY_MIN : 0);
              const bonus = data.backgroundAbilityScoreIncrease?.[attr] ?? 0;
              const effectiveScore = getEffectiveAttribute(
                data.attributes,
                combinedAbilityBonuses,
                attr,
                effectiveEpicBoonAbilityScore,
                hasPrimalChampion,
                hasBodyAndMind,
                data.grapplerAbilityScore
              );
              return (
                <AbilityScoreBox
                  key={`${attr}-${method}`}
                  label={attr}
                  score={baseScore}
                  onScoreChange={(v) => updateAttribute(data, onChange, attr, v)}
                  mode={method}
                  usedScores={assignedScores.filter((v) => v !== (data.attributes[attr] ?? 0))}
                  pointsRemaining={pointsRemaining}
                  backgroundBonus={bonus}
                  effectiveScore={effectiveScore}
                  readOnly={readOnly}
                />
              );
            })}
          </div>
        </div>
      </Section>
    </div>
  );
}
