'use client';

import * as React from 'react';
import { ChevronDown, ChevronRight, Info } from 'lucide-react';
import { LoadingState } from '@/components/ui/loading-state';
import { cn } from '@/lib/utils';
import type { RuleItemResponse } from '@rpgforce-ai/shared';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { MysticArcanumStyleSpellRow } from './spell-detail';
import { getSpellListLevelLabel, spellChipClass } from './spell-utils';
import type { useWizardSpellbook } from './use-wizard-spellbook';

interface WizardSpellbookDialogProps {
  open: boolean;
  onClose: () => void;
  spellsLoading: boolean;
  availableWizardLevels: number[];
  spellsBySpellLevel: Record<number, RuleItemResponse[]>;
  spellbook: ReturnType<typeof useWizardSpellbook>;
}

export function WizardSpellbookDialog({
  open,
  onClose,
  spellsLoading,
  availableWizardLevels,
  spellsBySpellLevel,
  spellbook,
}: WizardSpellbookDialogProps) {
  const [search, setSearch] = React.useState('');
  const [expandedIds, setExpandedIds] = React.useState<Set<string>>(new Set());
  const [expandedLevels, setExpandedLevels] = React.useState<Set<number>>(new Set());

  React.useEffect(() => {
    if (!open) {
      setSearch('');
      setExpandedIds(new Set());
      setExpandedLevels(new Set());
      return;
    }
    setSearch('');
    setExpandedIds(new Set());
    setExpandedLevels(new Set(availableWizardLevels));
  }, [open]);

  const filteredByLevel = React.useMemo(() => {
    const out: Record<number, RuleItemResponse[]> = {};
    const q = search.trim().toLowerCase();
    for (const lvl of availableWizardLevels) {
      const all = spellsBySpellLevel[lvl] ?? [];
      out[lvl] = q ? all.filter((s) => s.name.toLowerCase().includes(q)) : all;
    }
    return out;
  }, [search, availableWizardLevels, spellsBySpellLevel]);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogTitle className="pr-8">Wizard Spellbook</DialogTitle>
        <DialogDescription asChild>
          <div className="flex max-h-[70vh] min-h-0 flex-col text-sm">
            <div className="mb-3 flex shrink-0 items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">Learned by level</span>
              <span
                className={cn(
                  'inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold tabular-nums',
                  spellbook.count >= spellbook.max
                    ? 'border-primary/40 bg-primary/10 text-primary'
                    : 'border-border bg-muted/40 text-foreground'
                )}
              >
                {spellbook.count} / {spellbook.max}
              </span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="cursor-pointer rounded text-muted-foreground transition-colors hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label="About learned-by-level capacity"
                  >
                    <Info className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[260px] text-center">
                  Spells added by scroll don&apos;t count toward your learned-by-level capacity.
                </TooltipContent>
              </Tooltip>
            </div>

            <div className="shrink-0 overflow-hidden rounded-lg border border-border/60">
              <div className="bg-muted/40 px-3 py-2">
                <span className="font-serif text-sm font-semibold leading-none text-foreground">
                  Current spellbook
                </span>
              </div>
              <div className="max-h-32 overflow-y-auto overflow-x-hidden border-t border-border/30">
                {spellbook.listingLevels.length === 0 ? (
                  <p className="px-3 py-3 text-xs text-muted-foreground">
                    No spells in your spellbook yet.
                  </p>
                ) : (
                  <div className="divide-y divide-border/30">
                    {spellbook.listingLevels.map(({ level: listLvl, entries }) => (
                      <div key={`spellbook-list-${listLvl}`} className="px-3 py-2">
                        <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          {getSpellListLevelLabel(listLvl)}
                        </div>
                        <ul className="space-y-1.5">
                          {entries.map((e) => (
                            <li
                              key={`${listLvl}-${e.name.toLowerCase()}`}
                              className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1"
                            >
                              <span className="text-xs font-medium text-foreground">
                                {e.name}
                              </span>
                              <span className="flex flex-wrap items-center gap-1">
                                {e.byLevel && (
                                  <span className={spellChipClass}>Learned by level</span>
                                )}
                                {e.byScroll && (
                                  <span className={spellChipClass}>By scroll</span>
                                )}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="mb-3 mt-3 shrink-0 border-t border-border pt-3">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search wizard spells..."
                className="w-full rounded-md border border-border bg-secondary/40 px-2 py-1.5 text-sm text-foreground outline-none focus:border-primary"
                autoFocus
              />
            </div>

            {spellsLoading && (
              <LoadingState inline className="shrink-0 justify-center py-8" />
            )}

            {!spellsLoading &&
              availableWizardLevels.every(
                (lvl) => (filteredByLevel[lvl] ?? []).length === 0
              ) && (
                <div className="py-6 text-center text-muted-foreground">No spells found.</div>
              )}

            {!spellsLoading && (
              <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto overflow-x-hidden pr-1">
                {availableWizardLevels.map((lvl) => {
                  const rows = filteredByLevel[lvl] ?? [];
                  const levelOpen = expandedLevels.has(lvl);
                  return (
                    <div
                      key={`spellbook-level-${lvl}`}
                      className="overflow-hidden rounded-lg border border-border/60"
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedLevels((prev) => {
                            const next = new Set(prev);
                            if (next.has(lvl)) next.delete(lvl);
                            else next.add(lvl);
                            return next;
                          })
                        }
                        className="cursor-pointer flex w-full items-center justify-between bg-muted/40 px-3 py-2.5 text-left transition-colors hover:bg-muted/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <span className="font-serif text-lg font-semibold leading-none text-foreground">
                          {getSpellListLevelLabel(lvl)}
                        </span>
                        {levelOpen ? (
                          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                        )}
                      </button>
                      {levelOpen && (
                        <div className="divide-y divide-border/30">
                          {rows.length === 0 && (
                            <div className="px-3 py-2 text-center text-xs text-muted-foreground">
                              No spells available.
                            </div>
                          )}
                          {rows.map((spell) => {
                            const isExpanded = expandedIds.has(spell.id);
                            const keyName = spell.name.trim().toLowerCase();
                            const isLearned = (spellbook.byLevel[lvl] ?? []).some(
                              (n) => n.trim().toLowerCase() === keyName
                            );
                            const isFromScroll = (spellbook.byScrollByLevel[lvl] ?? []).some(
                              (n) => n.trim().toLowerCase() === keyName
                            );
                            const inSpellbookByAny = isLearned || isFromScroll;
                            return (
                              <div key={`spellbook-${lvl}-${spell.id}`}>
                                <MysticArcanumStyleSpellRow
                                  spell={spell}
                                  isExpanded={isExpanded}
                                  onToggleExpanded={() =>
                                    setExpandedIds((prev) => {
                                      const next = new Set(prev);
                                      if (next.has(spell.id)) next.delete(spell.id);
                                      else next.add(spell.id);
                                      return next;
                                    })
                                  }
                                  isRowSelected={inSpellbookByAny}
                                  footer={
                                    <>
                                      {isLearned ? (
                                        <button
                                          type="button"
                                          onClick={() => spellbook.removeByLevel(lvl, spell.name)}
                                          className="cursor-pointer rounded-md border border-border bg-muted/40 px-2 py-1 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted/60"
                                        >
                                          Clear selection by level
                                        </button>
                                      ) : !isFromScroll ? (
                                        <button
                                          type="button"
                                          onClick={() => spellbook.addByLevel(lvl, spell.name)}
                                          className={cn(
                                            'rounded-md border px-2 py-1 text-xs font-semibold transition-colors',
                                            spellbook.canAddMore
                                              ? 'cursor-pointer border-primary/70 bg-primary/5 text-primary hover:bg-primary/10'
                                              : 'cursor-not-allowed border-border text-muted-foreground opacity-50'
                                          )}
                                          disabled={!spellbook.canAddMore}
                                        >
                                          Learn by level
                                        </button>
                                      ) : null}
                                      {isFromScroll ? (
                                        <button
                                          type="button"
                                          onClick={() => spellbook.removeByScroll(lvl, spell.name)}
                                          className="cursor-pointer rounded-md border border-border bg-muted/40 px-2 py-1 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted/60"
                                        >
                                          Clear selection by scroll
                                        </button>
                                      ) : !isLearned ? (
                                        <button
                                          type="button"
                                          onClick={() => spellbook.addByScroll(lvl, spell.name)}
                                          className="cursor-pointer rounded-md border border-primary/70 bg-primary/5 px-2 py-1 text-xs font-semibold text-primary transition-colors hover:bg-primary/10"
                                        >
                                          Add by scroll
                                        </button>
                                      ) : null}
                                    </>
                                  }
                                />
                              </div>
                            );
                          })}
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
