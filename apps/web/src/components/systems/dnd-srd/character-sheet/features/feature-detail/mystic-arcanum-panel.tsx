'use client';

import * as React from 'react';
import { ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react';
import { LoadingState } from '@/components/ui/loading-state';
import { cn } from '@/lib/utils';
import type { RuleItemResponse } from '@rpgforce-ai/shared';
import type { CharacterFormData } from '@/lib/dnd-srd/character-state';
import { resolveMysticArcanumSpellLevel } from '@/lib/dnd-srd/character-state';
import { useAllSpells, spellsForClass } from '../../sections/spellcasting/use-all-spells';
import { SpellAccordionRow } from './spell-accordion-row';
import { SelectionSection } from './feature-detail-primitives';

function mysticArcanumRuleItemSpellLevel(s: RuleItemResponse): number {
  const n = (s.normalized ?? {}) as Record<string, unknown>;
  const lvl = Number(n.level ?? 0);
  return Number.isFinite(lvl) ? Math.max(0, Math.min(9, Math.floor(lvl))) : 0;
}

interface MysticArcanumSpellPickerPanelProps {
  data: CharacterFormData;
  onChange: (d: CharacterFormData) => void;
  classes: RuleItemResponse[];
  gainCount: number;
  gainedAtLevels?: number[];
  gainedAtDetails?: string[];
}

export function MysticArcanumSpellPickerPanel({
  data,
  onChange,
  classes,
  gainCount,
  gainedAtLevels,
  gainedAtDetails,
}: MysticArcanumSpellPickerPanelProps) {
  const [pageIndex, setPageIndex] = React.useState(0);
  const [levelAccordionOpen, setLevelAccordionOpen] = React.useState(true);
  const [expandedSpellIds, setExpandedSpellIds] = React.useState<Set<string>>(new Set());

  const safeGainCount = Math.max(1, gainCount);
  const levelsKey = (gainedAtLevels ?? []).join(',');
  const detailsKey = (gainedAtDetails ?? []).join('|');
  React.useEffect(() => {
    setPageIndex(0);
  }, [safeGainCount, data.level, levelsKey, detailsKey]);

  React.useEffect(() => {
    if (pageIndex >= safeGainCount) setPageIndex(Math.max(0, safeGainCount - 1));
  }, [safeGainCount, pageIndex]);

  const classItem = classes.find((c) => c.id === data.classRuleItemId);
  const isWarlock = classItem?.name.trim().toLowerCase() === 'warlock';
  const { allSpells, allSpellsLoading } = useAllSpells(classItem?.packId ?? null);
  const warlockSpells = React.useMemo(
    () => (isWarlock && classItem ? spellsForClass(allSpells, classItem.name) : []),
    [isWarlock, classItem, allSpells],
  );
  const loading = allSpellsLoading && isWarlock;

  const slotIndex = Math.min(pageIndex, safeGainCount - 1);
  const showPager = safeGainCount > 1;
  const levelForSlot = gainedAtLevels?.[slotIndex];
  const detailForSlot = gainedAtDetails?.[slotIndex];
  const requiredSpellLevel = resolveMysticArcanumSpellLevel(detailForSlot, levelForSlot);

  React.useEffect(() => {
    setExpandedSpellIds(new Set());
    setLevelAccordionOpen(true);
  }, [slotIndex, requiredSpellLevel]);

  const spellsForSlot = React.useMemo(
    () =>
      warlockSpells
        .filter((s) => mysticArcanumRuleItemSpellLevel(s) === requiredSpellLevel)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [warlockSpells, requiredSpellLevel],
  );

  const ensureByGain = (d: CharacterFormData, n: number): (string | null)[] =>
    Array.from({ length: n }, (_, i) => (d.mysticArcanumSpellNamesByGain ?? [])[i] ?? null);

  const byGain = ensureByGain(data, safeGainCount);
  const patchGain = (index: number, spellName: string | null) => {
    const next = ensureByGain(data, safeGainCount);
    next[index] = spellName;
    onChange({ ...data, mysticArcanumSpellNamesByGain: next });
  };

  const selectedName = byGain[slotIndex] ?? null;
  const getLevelLabel = (level: number) => (level === 0 ? 'Cantrips' : `Level ${level}`);

  const toggleExpand = (id: string) =>
    setExpandedSpellIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (!classItem || classItem.name.trim().toLowerCase() !== 'warlock') {
    return (
      <SelectionSection>
        <p className="text-xs text-muted-foreground">
          Mystic Arcanum uses the Warlock spell list. Select the Warlock class on your sheet to
          choose arcanum spells.
        </p>
      </SelectionSection>
    );
  }

  return (
    <SelectionSection className="flex min-h-0 min-w-0 flex-1 flex-col">
      {showPager && (
        <div className="mb-3 flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-muted/20 px-2 py-2">
          <button
            type="button"
            aria-label="Previous arcanum"
            disabled={slotIndex <= 0}
            onClick={() => setPageIndex((i) => Math.max(0, i - 1))}
            className={cn(
              'flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-background text-foreground transition-colors',
              slotIndex <= 0 ? 'cursor-not-allowed opacity-40' : 'cursor-pointer hover:bg-muted/60',
            )}
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </button>
          <div className="min-w-0 flex-1 text-center">
            <p className="text-xs font-semibold text-foreground">
              {levelForSlot != null ? `Level ${levelForSlot}` : `Arcanum ${slotIndex + 1}`}
            </p>
          </div>
          <button
            type="button"
            aria-label="Next arcanum"
            disabled={slotIndex >= safeGainCount - 1}
            onClick={() => setPageIndex((i) => Math.min(safeGainCount - 1, i + 1))}
            className={cn(
              'flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-background text-foreground transition-colors',
              slotIndex >= safeGainCount - 1
                ? 'cursor-not-allowed opacity-40'
                : 'cursor-pointer hover:bg-muted/60',
            )}
          >
            <ChevronRight className="h-4 w-4" aria-hidden />
          </button>
        </div>
      )}

      {!showPager && levelForSlot == null && (
        <p className="mb-2 text-xs font-semibold text-foreground">This arcanum</p>
      )}

      {loading ? (
        <LoadingState inline className="justify-center py-4" />
      ) : spellsForSlot.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No level {requiredSpellLevel} Warlock spells found in this pack.
        </p>
      ) : (
        <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto overflow-x-hidden pr-1">
          <div className="overflow-hidden rounded-lg border border-border/60">
            <button
              type="button"
              onClick={() => setLevelAccordionOpen((o) => !o)}
              className="cursor-pointer flex w-full items-center justify-between bg-muted/40 px-3 py-2.5 text-left transition-colors hover:bg-muted/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="font-serif text-lg font-semibold leading-none text-foreground">
                {getLevelLabel(requiredSpellLevel)}
              </span>
              {levelAccordionOpen ? (
                <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              )}
            </button>

            {levelAccordionOpen && (
              <div className="divide-y divide-border/30">
                {spellsForSlot.map((spell) => {
                  const isRowSelected =
                    selectedName != null &&
                    spell.name.trim().toLowerCase() === selectedName.trim().toLowerCase();
                  return (
                    <SpellAccordionRow
                      key={spell.id}
                      spell={spell}
                      isExpanded={expandedSpellIds.has(spell.id)}
                      isSelected={isRowSelected}
                      onToggleExpand={toggleExpand}
                      selectButton={{
                        label: isRowSelected ? 'Clear selection' : 'Select spell',
                        onClick: () => patchGain(slotIndex, isRowSelected ? null : spell.name),
                      }}
                    />
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </SelectionSection>
  );
}
