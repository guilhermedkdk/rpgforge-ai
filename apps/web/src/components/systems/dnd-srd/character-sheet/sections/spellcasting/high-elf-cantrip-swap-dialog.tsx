'use client';

import * as React from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { LoadingState } from '@/components/ui/loading-state';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { useAllSpells, spellsForClass } from './use-all-spells';
import { SpellRuleItemDetailBody } from './spell-detail';
import { spellChipClass } from './spell-utils';

interface HighElfCantripSwapDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  spellPackId: string | null;
  /** Currently granted cantrip (defaults to Prestidigitation) — hidden from the list. */
  currentCantripName: string | null | undefined;
  onSelect: (spellName: string) => void;
}

/** High Elf (Elven Lineage): replace the default lineage cantrip with another Wizard cantrip. */
export function HighElfCantripSwapDialog({
  open,
  onOpenChange,
  spellPackId,
  currentCantripName,
  onSelect,
}: HighElfCantripSwapDialogProps) {
  const [search, setSearch] = React.useState('');
  const [expandedIds, setExpandedIds] = React.useState<Set<string>>(new Set());

  const { allSpells, allSpellsLoading: loading } = useAllSpells(spellPackId);
  const cantrips = React.useMemo(
    () =>
      spellsForClass(allSpells, 'Wizard')
        .filter(
          (s) => Number((s.normalized as Record<string, unknown> | undefined)?.level ?? 0) === 0,
        )
        .sort((a, b) => a.name.localeCompare(b.name)),
    [allSpells],
  );

  React.useEffect(() => {
    if (!open) {
      setSearch('');
      setExpandedIds(new Set());
    }
  }, [open]);

  const visibleCantrips = cantrips.filter((s) => {
    const currentName = (currentCantripName ?? 'Prestidigitation').toLowerCase();
    return (
      s.name.toLowerCase() !== currentName &&
      s.name.toLowerCase().includes(search.toLowerCase())
    );
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogTitle className="pr-8">Select Wizard Cantrip</DialogTitle>
        <DialogDescription asChild>
          <div className="max-h-[70vh] overflow-y-auto pr-1 text-sm">
            <div className="mb-3 border-b border-border pb-2">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search cantrips..."
                className="w-full rounded-md border border-border bg-secondary/40 px-2 py-1.5 text-sm text-foreground outline-none focus:border-primary"
                autoFocus
              />
            </div>

            {loading && (
              <LoadingState inline label="Loading cantrips…" className="justify-center py-8" />
            )}

            {!loading && cantrips.length === 0 && (
              <div className="py-6 text-center text-muted-foreground">No cantrips found.</div>
            )}

            {!loading && cantrips.length > 0 && (
              <div className="space-y-1.5">
                {visibleCantrips.map((spell) => {
                  const n = (spell.normalized ?? {}) as Record<string, unknown>;
                  const school = (n.school as { name?: string } | undefined)?.name;
                  const concentration = Boolean(n.concentration);
                  const ritual = Boolean(n.ritual);
                  const isExpanded = expandedIds.has(spell.id);

                  return (
                    <div key={spell.id} className="rounded-md border border-border/60 bg-card">
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedIds((prev) => {
                            const next = new Set(prev);
                            if (next.has(spell.id)) next.delete(spell.id);
                            else next.add(spell.id);
                            return next;
                          })
                        }
                        className="flex w-full cursor-pointer items-center justify-between px-3 py-2 text-left hover:bg-muted/40"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-0.5">
                            <span className="truncate text-sm font-medium text-foreground">
                              {spell.name}
                            </span>
                            {school && <span className={spellChipClass}>{school}</span>}
                            {concentration && (
                              <span className={spellChipClass}>Concentration</span>
                            )}
                            {ritual && <span className={spellChipClass}>Ritual</span>}
                          </div>
                        </div>
                        {isExpanded ? (
                          <ChevronDown className="ml-2 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="ml-2 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        )}
                      </button>

                      {isExpanded && (
                        <div className="space-y-2.5 bg-muted/10 px-4 pb-3 pt-1">
                          <SpellRuleItemDetailBody spell={spell} />
                          <button
                            type="button"
                            onClick={() => onSelect(spell.name)}
                            className={cn(
                              'cursor-pointer rounded-md border px-2 py-1 text-xs font-semibold transition-colors',
                              'border-primary/70 bg-primary/5 text-primary hover:bg-primary/10',
                            )}
                          >
                            Select cantrip
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </DialogDescription>
      </DialogContent>
    </Dialog>
  );
}
