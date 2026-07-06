'use client';

import * as React from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { LoadingState } from '@/components/ui/loading-state';
import { cn } from '@/lib/utils';
import type { RuleItemResponse } from '@rpgforce-ai/shared';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { MysticArcanumStyleSpellRow } from './spell-detail';
import type { usePactOfTome } from './use-pact-of-tome';

interface PactOfTomeDialogProps {
  open: boolean;
  onClose: () => void;
  spellsLoading: boolean;
  /** Level-0 spells from any class, minus spells already known from other sources. */
  cantripOptions: RuleItemResponse[];
  /** Level-1 ritual spells from any class, minus spells already prepared from other sources. */
  ritualOptions: RuleItemResponse[];
  pact: ReturnType<typeof usePactOfTome>;
}

interface SpellSectionProps {
  title: string;
  count: number;
  max: number;
  canAdd: boolean;
  options: RuleItemResponse[];
  isSelected: (name: string) => boolean;
  onAdd: (name: string) => void;
  onRemove: (name: string) => void;
  expandedIds: Set<string>;
  toggleExpanded: (id: string) => void;
  open: boolean;
  onToggleOpen: () => void;
}

function SpellSection({
  title,
  count,
  max,
  canAdd,
  options,
  isSelected,
  onAdd,
  onRemove,
  expandedIds,
  toggleExpanded,
  open,
  onToggleOpen,
}: SpellSectionProps) {
  return (
    <div className="overflow-hidden rounded-lg border border-border/60">
      <button
        type="button"
        onClick={onToggleOpen}
        className="cursor-pointer flex w-full items-center justify-between bg-muted/40 px-3 py-2.5 text-left transition-colors hover:bg-muted/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="flex items-center gap-2">
          <span className="font-serif text-lg font-semibold leading-none text-foreground">
            {title}
          </span>
          <span
            className={cn(
              'inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold tabular-nums',
              count >= max
                ? 'border-primary/40 bg-primary/10 text-primary'
                : 'border-border bg-muted/40 text-foreground'
            )}
          >
            {count} / {max}
          </span>
        </span>
        {open ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
      </button>
      {open && (
        <div className="divide-y divide-border/30">
          {options.length === 0 && (
            <div className="px-3 py-2 text-center text-xs text-muted-foreground">
              No spells available.
            </div>
          )}
          {options.map((spell) => {
            const selected = isSelected(spell.name);
            return (
              <MysticArcanumStyleSpellRow
                key={spell.id}
                spell={spell}
                isExpanded={expandedIds.has(spell.id)}
                onToggleExpanded={() => toggleExpanded(spell.id)}
                isRowSelected={selected}
                footer={
                  selected ? (
                    <button
                      type="button"
                      onClick={() => onRemove(spell.name)}
                      className="cursor-pointer rounded-md border border-border bg-muted/40 px-2 py-1 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted/60"
                    >
                      Clear selection
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onAdd(spell.name)}
                      disabled={!canAdd}
                      className={cn(
                        'rounded-md border px-2 py-1 text-xs font-semibold transition-colors',
                        canAdd
                          ? 'cursor-pointer border-primary/70 bg-primary/5 text-primary hover:bg-primary/10'
                          : 'cursor-not-allowed border-border text-muted-foreground opacity-50'
                      )}
                    >
                      Select spell
                    </button>
                  )
                }
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

export function PactOfTomeDialog({
  open,
  onClose,
  spellsLoading,
  cantripOptions,
  ritualOptions,
  pact,
}: PactOfTomeDialogProps) {
  const [search, setSearch] = React.useState('');
  const [expandedIds, setExpandedIds] = React.useState<Set<string>>(new Set());
  const [openSections, setOpenSections] = React.useState<{ cantrips: boolean; rituals: boolean }>({
    cantrips: true,
    rituals: true,
  });

  React.useEffect(() => {
    if (!open) return;
    setSearch('');
    setExpandedIds(new Set());
    setOpenSections({ cantrips: true, rituals: true });
  }, [open]);

  const toggleExpanded = React.useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const q = search.trim().toLowerCase();
  const filteredCantrips = q
    ? cantripOptions.filter((s) => s.name.toLowerCase().includes(q))
    : cantripOptions;
  const filteredRituals = q
    ? ritualOptions.filter((s) => s.name.toLowerCase().includes(q))
    : ritualOptions;

  const cantripSet = React.useMemo(
    () => new Set(pact.cantrips.map((n) => n.toLowerCase())),
    [pact.cantrips]
  );
  const ritualSet = React.useMemo(
    () => new Set(pact.rituals.map((n) => n.toLowerCase())),
    [pact.rituals]
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogTitle className="pr-8">Book of Shadows</DialogTitle>
        <DialogDescription asChild>
          <div className="flex max-h-[70vh] min-h-0 flex-col text-sm">
            <div className="mb-3 shrink-0">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search spells..."
                className="w-full rounded-md border border-border bg-secondary/40 px-2 py-1.5 text-sm text-foreground outline-none focus:border-primary"
                autoFocus
              />
            </div>

            {spellsLoading ? (
              <LoadingState inline className="shrink-0 justify-center py-8" />
            ) : (
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overflow-x-hidden pr-1">
                <SpellSection
                  title="Cantrips"
                  count={pact.cantrips.length}
                  max={pact.maxCantrips}
                  canAdd={pact.canAddCantrip}
                  options={filteredCantrips}
                  isSelected={(name) => cantripSet.has(name.trim().toLowerCase())}
                  onAdd={pact.addCantrip}
                  onRemove={pact.removeCantrip}
                  expandedIds={expandedIds}
                  toggleExpanded={toggleExpanded}
                  open={openSections.cantrips}
                  onToggleOpen={() =>
                    setOpenSections((prev) => ({ ...prev, cantrips: !prev.cantrips }))
                  }
                />
                <SpellSection
                  title="Level 1 Rituals"
                  count={pact.rituals.length}
                  max={pact.maxRituals}
                  canAdd={pact.canAddRitual}
                  options={filteredRituals}
                  isSelected={(name) => ritualSet.has(name.trim().toLowerCase())}
                  onAdd={pact.addRitual}
                  onRemove={pact.removeRitual}
                  expandedIds={expandedIds}
                  toggleExpanded={toggleExpanded}
                  open={openSections.rituals}
                  onToggleOpen={() =>
                    setOpenSections((prev) => ({ ...prev, rituals: !prev.rituals }))
                  }
                />
              </div>
            )}
          </div>
        </DialogDescription>
      </DialogContent>
    </Dialog>
  );
}
