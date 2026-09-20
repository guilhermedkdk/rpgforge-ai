'use client';

import { Children, type ReactNode } from 'react';
import { Search } from 'lucide-react';
import { Input } from './input';

/**
 * The app's filter box: a search field, and under a rule the chip rows that narrow the list. One
 * shape for the library, the explore feed and the owner's sheets, so filtering looks the same
 * wherever it happens.
 */
export const FilterPanel = ({
  query,
  onQueryChange,
  placeholder,
  children,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  /** Doubles as the field's accessible name. */
  placeholder: string;
  /** The `FilterChipRow`s. Nothing here, no rule. */
  children?: ReactNode;
}) => {
  // `toArray` drops the `false`s a conditional row leaves behind, so a category with no facets
  // gets no empty ruled section.
  const rows = Children.toArray(children);

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-card/50 p-3 sm:p-4">
      {/* No `type="search"`: that is what makes the browser draw its own clear "x". */}
      <div className="relative max-w-md">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
          className="pl-9"
        />
      </div>
      {rows.length > 0 ? (
        <div className="flex flex-col gap-2 border-t border-border/60 pt-3">{rows}</div>
      ) : null}
    </div>
  );
};
