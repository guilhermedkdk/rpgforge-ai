'use client';

import { cn } from '@/lib/utils';
import type { FilterOption } from './browse-config';

const chipClass =
  'cursor-pointer rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
const chipIdleClass =
  'border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground';
const chipActiveClass = 'border-primary bg-primary text-primary-foreground';

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
      <span className="w-20 shrink-0 pt-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
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
                  'ml-1 text-[10px]',
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
