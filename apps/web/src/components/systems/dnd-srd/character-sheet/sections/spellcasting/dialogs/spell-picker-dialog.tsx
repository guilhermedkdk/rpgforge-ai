'use client';

import * as React from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { LoadingState } from '@/components/ui/loading-state';
import { cn } from '@/lib/utils';
import type { RuleItemResponse } from '@rpgforce-ai/shared';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { SpellRuleItemDetailBody } from '../spell-detail';
import { accordionSelectButtonClass } from '../../../features/feature-detail/shared/spell-accordion-row';
import { spellChipClass } from '../spell-display';

/** One casting class the picker can buy for, with its own allowance at the open level. */
export interface SpellPickerClassTab {
  classRuleItemId: string;
  className: string;
  picked: number;
  max: number;
  available: number;
}

interface SpellPickerDialogProps {
  /** Spell level being picked, or null when closed. */
  level: number | null;
  /** Spells available for selection at this level (already excluding selected ones). */
  availableSpells: RuleItemResponse[];
  spellsLoading: boolean;
  canAdd: boolean;
  /**
   * Casting classes to choose between. Empty on a single-class sheet, where the spell's owner is
   * implied and the dialog looks exactly as it always did.
   */
  classTabs?: SpellPickerClassTab[];
  activeClassId?: string | null;
  onSelectClass?: (classRuleItemId: string) => void;
  onSelect: (spell: RuleItemResponse) => void;
  onClose: () => void;
}

export function SpellPickerDialog({
  level,
  availableSpells,
  spellsLoading,
  canAdd,
  classTabs = [],
  activeClassId,
  onSelectClass,
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
    s.name.toLowerCase().includes(search.trim().toLowerCase())
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
        {/* Class tabs and search stay put; only the spell list scrolls. Same shape as the
            spellbook and Book of Shadows dialogs. */}
        <DialogDescription asChild>
          <div className="flex max-h-[70vh] min-h-0 flex-col text-sm">
            {classTabs.length > 1 && (
              // Each class has its own list and its own allowance, so the picker has to know which
              // one is paying before it can show anything.
              <div className="mb-3 flex shrink-0 flex-wrap gap-1.5">
                {classTabs.map((tab) => {
                  const isActive = tab.classRuleItemId === activeClassId;
                  const isFull = tab.picked >= tab.max;
                  return (
                    <button
                      key={tab.classRuleItemId}
                      type="button"
                      onClick={() => onSelectClass?.(tab.classRuleItemId)}
                      className={cn(
                        'flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-semibold transition-colors',
                        isActive
                          ? 'border-primary bg-primary/10 text-foreground'
                          : 'border-border bg-secondary/40 text-muted-foreground hover:border-primary/60 hover:text-foreground'
                      )}
                      aria-pressed={isActive}
                    >
                      <span>{tab.className}</span>
                      <span
                        className={cn(
                          'rounded bg-background/70 px-1 tabular-nums',
                          isFull ? 'text-muted-foreground' : 'text-foreground'
                        )}
                      >
                        {tab.picked}/{tab.max}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            <div className="mb-3 shrink-0 border-b border-border pb-2">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search spells..."
                className="w-full rounded-md border border-border bg-secondary/40 px-2 py-1.5 text-sm text-foreground outline-none focus-visible:border-ring"
                autoFocus
              />
            </div>

            {spellsLoading && (
              <LoadingState inline className="shrink-0 justify-center py-8" />
            )}

            {!spellsLoading && filtered.length === 0 && (
              <div className="shrink-0 py-6 text-center text-muted-foreground">No spells found.</div>
            )}

            {!spellsLoading && filtered.length > 0 && (
              <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto overflow-x-hidden pr-1">
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
                            className={accordionSelectButtonClass(false, !canAdd)}
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
