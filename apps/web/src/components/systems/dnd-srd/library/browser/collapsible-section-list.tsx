'use client';

import * as React from 'react';
import { ChevronDown, ChevronsDownUp, ChevronsUpDown } from 'lucide-react';

export interface CollapsibleEntry {
  key: string;
  title: string;
  subtitle?: string;
  /** Leading square slot (the level number, for class features). */
  badge?: React.ReactNode;
  content: React.ReactNode;
}

/**
 * Collapsible list used by every long section of a library detail page (class/subclass features,
 * ruleset chapters). `open` is driven by state so one control can expand the whole list; the native
 * details/summary pair is kept for its built-in keyboard and screen-reader behaviour.
 */
export const CollapsibleSectionList = ({
  title,
  entries,
}: {
  title: string;
  entries: CollapsibleEntry[];
}) => {
  const [openKeys, setOpenKeys] = React.useState<ReadonlySet<string>>(new Set());
  const allOpen = entries.length > 0 && openKeys.size >= entries.length;

  const toggleAll = () => setOpenKeys(allOpen ? new Set() : new Set(entries.map((e) => e.key)));

  const setOpen = (key: string, open: boolean) =>
    setOpenKeys((prev) => {
      if (prev.has(key) === open) return prev;
      const next = new Set(prev);
      if (open) next.add(key);
      else next.delete(key);
      return next;
    });

  if (entries.length === 0) return null;

  return (
    <section aria-label={title}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="font-serif text-lg font-semibold text-foreground">
          {title}
          <span className="ml-2 text-sm font-normal text-muted-foreground">{entries.length}</span>
        </h2>
        <button
          type="button"
          onClick={toggleAll}
          className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {allOpen ? (
            <ChevronsDownUp className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <ChevronsUpDown className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          {allOpen ? 'Recolher tudo' : 'Expandir tudo'}
        </button>
      </div>

      <div className="flex flex-col gap-2">
        {entries.map((entry) => {
          const isOpen = openKeys.has(entry.key);
          return (
            <details
              key={entry.key}
              open={isOpen}
              onToggle={(e) => setOpen(entry.key, e.currentTarget.open)}
              className={`group overflow-hidden rounded-xl border bg-card transition-colors duration-300 hover:border-primary/40 ${
                isOpen ? 'border-primary/40' : 'border-border'
              }`}
            >
              <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
                {entry.badge != null && (
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg font-serif text-sm font-bold transition-colors duration-300 ${
                      isOpen
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-secondary text-muted-foreground group-hover:bg-primary group-hover:text-primary-foreground'
                    }`}
                  >
                    {entry.badge}
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span
                    className={`block truncate font-serif text-sm font-semibold transition-colors duration-300 group-hover:text-primary-ink ${
                      isOpen ? 'text-primary-ink' : 'text-foreground'
                    }`}
                  >
                    {entry.title}
                  </span>
                  {entry.subtitle ? (
                    <span className="block truncate text-xs text-muted-foreground">
                      {entry.subtitle}
                    </span>
                  ) : null}
                </span>
                <ChevronDown
                  className={`h-4 w-4 shrink-0 transition-transform duration-300 ${
                    isOpen ? 'rotate-180 text-primary-ink' : 'text-muted-foreground/50'
                  }`}
                  aria-hidden="true"
                />
              </summary>
              <div className="border-t border-border/60 px-4 py-3">{entry.content}</div>
            </details>
          );
        })}
      </div>
    </section>
  );
};
