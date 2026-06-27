'use client';

import * as React from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { LoadingState } from '@/components/ui/loading-state';
import { cn } from '@/lib/utils';
import type { RuleItemResponse } from '@rpgforce-ai/shared';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { SpellRuleItemDetailBody } from './spell-detail';
import { spellChipClass } from './spell-utils';

interface SpellPickerDialogProps {
  /** Spell level being picked, or null when closed. */
  level: number | null;
  /** Spells available for selection at this level (already excluding selected ones). */
  availableSpells: RuleItemResponse[];
  spellsLoading: boolean;
  canAdd: boolean;
  onSelect: (spell: RuleItemResponse) => void;
  onClose: () => void;
}

export function SpellPickerDialog({
  level,
  availableSpells,
  spellsLoading,
  canAdd,
  onSelect,
  onClose,
}: SpellPickerDialogProps) {
  const [search, setSearch] = React.useState('');
  const [expandedIds, setExpandedIds] = React.useState<Set<string>>(new Set());

  const isOpen = level !== null;
  React.useEffect(() => {
    if (!isOpen) return;
    setSearch('');
    setExpandedIds(new Set());
  }, [isOpen, level]);

  const isCantrip = level === 0;
  const filtered = availableSpells.filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogTitle className="pr-8">
          Select {isCantrip ? 'Cantrips' : `Level ${level ?? ''} Spells`}
        </DialogTitle>
        <DialogDescription asChild>
          <div className="max-h-[70vh] overflow-y-auto pr-1 text-sm">
            <div className="mb-3 border-b border-border pb-2">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search spells..."
                className="w-full rounded-md border border-border bg-secondary/40 px-2 py-1.5 text-sm text-foreground outline-none focus:border-primary"
                autoFocus
              />
            </div>

            {spellsLoading && (
              <LoadingState inline label="Loading spells…" className="justify-center py-8" />
            )}

            {!spellsLoading && filtered.length === 0 && (
              <div className="py-6 text-center text-muted-foreground">No spells found.</div>
            )}

            {!spellsLoading && filtered.length > 0 && (
              <div className="space-y-1.5">
                {filtered.map((spell) => {
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
                            <span className="text-sm font-medium text-foreground truncate">
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
                            disabled={!canAdd}
                            onClick={() => onSelect(spell)}
                            className={cn(
                              'rounded-md border px-2 py-1 text-xs font-semibold transition-colors',
                              canAdd
                                ? 'cursor-pointer border-primary/70 bg-primary/5 text-primary hover:bg-primary/10'
                                : 'cursor-not-allowed border-border text-muted-foreground opacity-50'
                            )}
                          >
                            Select spell
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
