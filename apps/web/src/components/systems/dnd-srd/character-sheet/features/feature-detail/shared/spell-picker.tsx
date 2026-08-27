'use client';

import * as React from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

/** Expanded-spell-row state shared by every spell picker panel. */
export function useSpellRowExpansion() {
  const [expandedSpellIds, setExpandedSpellIds] = React.useState<Set<string>>(new Set());
  const toggleExpand = React.useCallback((id: string) => {
    setExpandedSpellIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const resetExpanded = React.useCallback(() => setExpandedSpellIds(new Set()), []);
  return { expandedSpellIds, toggleExpand, resetExpanded };
}

/** Static level box carrying a message instead of rows (no class, empty spellbook, no match). */
export function SpellLevelBox({ label, message }: { label: string; message: string }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border/60">
      <div className="bg-muted/40 px-3 py-2">
        <span className="font-serif text-sm font-semibold leading-none text-foreground">
          {label}
        </span>
      </div>
      <div className="border-t border-border/30">
        <p className="px-3 py-3 text-xs text-muted-foreground">{message}</p>
      </div>
    </div>
  );
}

/** Collapsible level box holding the spell rows (or an inline empty message). */
export function SpellLevelAccordion({
  label,
  open,
  onToggle,
  children,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-border/60">
      <button
        type="button"
        onClick={onToggle}
        className="cursor-pointer flex w-full items-center justify-between bg-muted/40 px-3 py-2.5 text-left transition-colors hover:bg-muted/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="font-serif text-lg font-semibold leading-none text-foreground">
          {label}
        </span>
        {open ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
      </button>
      {open && <div className="divide-y divide-border/30">{children}</div>}
    </div>
  );
}

/** Scroll container every picker wraps its level boxes in. */
export function SpellPickerScroll({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto overflow-x-hidden pr-1">
      {children}
    </div>
  );
}

/** Inline message shown inside an open accordion when it has no rows. */
export function SpellAccordionEmpty({ message }: { message: string }) {
  return <p className="px-3 py-3 text-xs text-muted-foreground">{message}</p>;
}

export const NO_CLASS_MESSAGE = 'Select a class on your sheet to load spells from your pack.';
