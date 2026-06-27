'use client';

import { useMemo, memo } from 'react';
import { ChevronDown, Minus, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  formatModifier,
  STANDARD_ARRAY,
  POINT_BUY_COSTS,
  POINT_BUY_BUDGET,
  POINT_BUY_MIN,
  POINT_BUY_MAX,
} from '@/lib/dnd-srd/character-state';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { CharacterFormData } from '../types';

export interface AbilityScoreBoxProps {
  label: string;
  score: number;
  onScoreChange: (v: number) => void;
  mode?: CharacterFormData['abilityScoreMethod'];
  usedScores?: number[];
  pointsRemaining?: number;
  backgroundBonus?: number;
  effectiveScore?: number;
  readOnly?: boolean;
}

function AbilityScoreBoxInner({
  label,
  score,
  onScoreChange,
  mode = 'standard-array',
  usedScores = [],
  pointsRemaining = POINT_BUY_BUDGET,
  backgroundBonus = 0,
  effectiveScore: effectiveScoreProp,
  readOnly = false,
}: AbilityScoreBoxProps) {
  const unassigned = score === 0;
  const effectiveScore =
    effectiveScoreProp !== undefined ? effectiveScoreProp : score + backgroundBonus;
  const mod = unassigned && backgroundBonus === 0 ? '—' : formatModifier(effectiveScore);
  const modColor =
    unassigned && backgroundBonus === 0 ? 'text-muted-foreground/40' : 'text-primary';

  const costCurrent = POINT_BUY_COSTS[score] ?? 0;
  const costNext = POINT_BUY_COSTS[score + 1] ?? Infinity;
  const pointBuyCanIncrease = score < POINT_BUY_MAX && pointsRemaining >= costNext - costCurrent;
  const pointBuyCanDecrease = score > POINT_BUY_MIN;

  const arrayOptions = useMemo(() => {
    const opts: Array<{ value: number; label: string; disabled?: boolean }> = [
      { value: 0, label: '—' },
      ...STANDARD_ARRAY.map((v) => ({
        value: v,
        label: String(v),
        disabled: usedScores.includes(v) && v !== score,
      })),
    ];
    return opts;
  }, [usedScores, score]);

  const displayValue = unassigned && !backgroundBonus ? '—' : effectiveScore;

  // Shared between the read-only pill and the standard-array trigger button.
  const pillBase =
    'absolute bottom-0 inline-flex h-7 min-w-10 w-12 translate-y-1/2 items-center justify-center rounded-full border-2 bg-card px-2.5 py-1.5 text-xs font-bold';
  const pillBorder =
    unassigned && !backgroundBonus
      ? 'border-border/50 text-muted-foreground/40'
      : 'border-border text-foreground';

  const handleArraySelect = (v: number) => {
    onScoreChange(v);
  };

  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        {label.slice(0, 3)}
      </span>
      <div
        className={cn(
          'relative flex h-20 w-16 flex-col items-center justify-center rounded-lg border-2 bg-secondary/50',
          unassigned ? 'border-border/50' : 'border-border'
        )}
      >
        <span className={cn('text-lg font-bold', modColor)}>{mod}</span>

        {readOnly && (
          <span className={cn(pillBase, pillBorder)} aria-label={`${label} value`}>
            {displayValue}
          </span>
        )}

        {!readOnly && mode === 'standard-array' && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={cn(
                  pillBase,
                  'gap-1 transition-colors hover:bg-primary/10 hover:border-primary/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer',
                  pillBorder
                )}
                aria-label={`${label} value`}
                aria-haspopup="listbox"
              >
                {displayValue}
                <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground/70" aria-hidden />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center" side="bottom" sideOffset={6} className="min-w-20 p-1">
              <ul role="listbox" aria-label={`${label} value`}>
                {arrayOptions.map((opt) => {
                  const isSelected = score === opt.value;
                  return (
                    <DropdownMenuItem
                      key={opt.value}
                      onSelect={() => {
                        if (!opt.disabled) handleArraySelect(opt.value);
                      }}
                      disabled={opt.disabled}
                      className={cn(
                        'cursor-pointer text-center',
                        isSelected && 'bg-primary/10 font-medium text-primary',
                        opt.disabled && 'cursor-not-allowed opacity-50'
                      )}
                    >
                      {opt.label}
                    </DropdownMenuItem>
                  );
                })}
              </ul>
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {!readOnly && mode === 'point-buy' && (
          <div className="absolute bottom-0 flex translate-y-1/2 items-center justify-center gap-0.5">
            <button
              type="button"
              onClick={() => onScoreChange(score - 1)}
              disabled={!pointBuyCanDecrease}
              className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-full border-2 border-border bg-card text-foreground transition-colors hover:border-primary hover:bg-primary/10 hover:text-primary disabled:cursor-not-allowed disabled:opacity-30 [&_svg]:shrink-0"
              aria-label={`Decrease ${label}`}
            >
              <Minus className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
            </button>
            <span className="flex h-7 min-w-8 items-center justify-center rounded-full border-2 border-border bg-card px-1.5 text-xs font-bold text-foreground">
              {effectiveScore}
            </span>
            <button
              type="button"
              onClick={() => onScoreChange(score + 1)}
              disabled={!pointBuyCanIncrease}
              className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-full border-2 border-border bg-card text-foreground transition-colors hover:border-primary hover:bg-primary/10 hover:text-primary disabled:cursor-not-allowed disabled:opacity-30 [&_svg]:shrink-0"
              aria-label={`Increase ${label}`}
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export const AbilityScoreBox = memo(AbilityScoreBoxInner);
