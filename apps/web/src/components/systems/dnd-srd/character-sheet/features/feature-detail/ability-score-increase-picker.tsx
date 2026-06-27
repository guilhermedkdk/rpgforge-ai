'use client';

import { cn } from '@/lib/utils';

interface AbilityScoreIncreasePickerProps {
  /** Attributes offered — all six for Epic Boon, Strength/Dexterity for Grappler. */
  attributes: readonly string[];
  /** Currently chosen attribute, or null. */
  selected: string | null;
  /** Effective score shown in each pill. For an unselected option this already excludes this
   *  increase, so it doubles as the value compared against `cap` to disable maxed options. */
  effectiveScores: Record<string, number>;
  /** This increase's ceiling (20 for Grappler, 30 for Epic Boon). An unselected option whose score
   *  already reached it can't benefit, so it is disabled. */
  cap: number;
  helperText: string;
  disabled?: boolean;
  onSelect: (attr: string | null) => void;
}

/**
 * Ability-score increase selector shared by the Epic Boon and Grappler feat panels: a helper line
 * plus a two-column grid of attribute buttons showing the (effective) score, toggled on click.
 */
export function AbilityScoreIncreasePicker({
  attributes,
  selected,
  effectiveScores,
  cap,
  helperText,
  disabled = false,
  onSelect,
}: AbilityScoreIncreasePickerProps) {
  return (
    <>
      <p className="mb-2 text-[11px] leading-snug text-muted-foreground">{helperText}</p>
      <div className="grid grid-cols-2 gap-1.5">
        {attributes.map((attr) => {
          const isSelected = selected === attr;
          const score = effectiveScores[attr] ?? 0;
          // An unselected score already at/above this increase's cap can't benefit from it.
          const atCap = !isSelected && score >= cap;
          const isDisabled = disabled || atCap;
          return (
            <button
              key={attr}
              type="button"
              disabled={isDisabled}
              onClick={() => {
                if (isDisabled) return;
                onSelect(isSelected ? null : attr);
              }}
              className={cn(
                'flex items-center justify-between gap-2 rounded-md border px-2 py-1.5 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                isDisabled
                  ? 'cursor-not-allowed border-border/60 bg-muted/20 opacity-50'
                  : isSelected
                    ? 'cursor-pointer border-primary bg-primary/10'
                    : 'cursor-pointer border-border/60 bg-muted/20 hover:bg-muted/40',
              )}
              aria-pressed={isSelected}
              title={atCap ? `${attr} is already at the maximum for this increase` : attr}
            >
              <span
                className={cn(
                  'text-[11px] font-semibold uppercase tracking-wider',
                  isSelected ? 'text-primary' : 'text-muted-foreground',
                )}
              >
                {attr.slice(0, 3)}
              </span>
              <span
                className={cn(
                  'flex h-6 min-w-9 items-center justify-center rounded-full border-2 px-1.5 text-xs font-bold tabular-nums',
                  isSelected
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-card text-foreground',
                )}
              >
                {score}
              </span>
            </button>
          );
        })}
      </div>
    </>
  );
}
