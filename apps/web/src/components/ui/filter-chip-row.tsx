'use client';

import { cn } from '@/lib/utils';
import { FILTER_CHIP_ACTIVE, FILTER_CHIP_CLASS, FILTER_CHIP_IDLE } from './filter-chip';

export interface FilterOption {
  value: string;
  label: string;
  /** Shown after the label, dimmed. */
  count?: number;
}

/**
 * One labelled row of filter chips: the library's facets, the explore feed's systems. An "all" chip
 * leads it, and clicking the selected option clears it.
 */
export const FilterChipRow = ({
  label,
  options,
  selected,
  onSelect,
  allLabel = 'All',
}: {
  label: string;
  options: FilterOption[];
  selected: string | null;
  onSelect: (value: string | null) => void;
  allLabel?: string;
}) => {
  if (options.length === 0) return null;

  return (
    <div className="flex items-start gap-2" role="group" aria-label={label}>
      <span className="w-24 shrink-0 pt-1 text-3xs font-semibold uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          className={cn(
            FILTER_CHIP_CLASS,
            selected === null ? FILTER_CHIP_ACTIVE : FILTER_CHIP_IDLE
          )}
          aria-pressed={selected === null}
          onClick={() => onSelect(null)}
        >
          {allLabel}
        </button>
        {options.map((option) => {
          const active = selected === option.value;
          return (
            <button
              key={option.value}
              type="button"
              className={cn(FILTER_CHIP_CLASS, active ? FILTER_CHIP_ACTIVE : FILTER_CHIP_IDLE)}
              aria-pressed={active}
              onClick={() => onSelect(active ? null : option.value)}
            >
              {option.label}
              {option.count != null && (
                <span
                  className={cn(
                    'ml-1.5 font-normal tabular-nums',
                    active ? 'opacity-90' : 'opacity-70'
                  )}
                >
                  {option.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};
