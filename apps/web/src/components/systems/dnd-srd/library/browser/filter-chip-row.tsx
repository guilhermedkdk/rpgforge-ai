'use client';

import { cn } from '@/lib/utils';
import {
  FILTER_CHIP_ACTIVE,
  FILTER_CHIP_CLASS,
  FILTER_CHIP_IDLE,
} from '@/components/ui/filter-chip';
import type { FilterOption } from './browse-config';

// This row was where the chip style started; it now shares it with every other filter in the app.
const chipClass = FILTER_CHIP_CLASS;
const chipIdleClass = FILTER_CHIP_IDLE;
const chipActiveClass = FILTER_CHIP_ACTIVE;

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
      <span className="w-20 shrink-0 pt-1 text-3xs font-semibold uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          className={cn(chipClass, selected === null ? chipActiveClass : chipIdleClass)}
          aria-pressed={selected === null}
          onClick={() => onSelect(null)}
        >
          {allLabel}
        </button>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            className={cn(chipClass, selected === option.value ? chipActiveClass : chipIdleClass)}
            aria-pressed={selected === option.value}
            onClick={() => onSelect(selected === option.value ? null : option.value)}
          >
            {option.label}
            {option.count != null && (
              <span
                className={cn(
                  'ml-1 text-3xs',
                  selected === option.value ? 'opacity-80' : 'opacity-60'
                )}
              >
                {option.count}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
};
