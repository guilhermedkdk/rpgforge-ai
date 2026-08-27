'use client';

import * as React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { LoadingState } from '@/components/ui/loading-state';
import { cn } from '@/lib/utils';
import { getSpellListLevelLabel, resolveMysticArcanumSpellLevel, ruleItemSpellLevel, spellsForClass, type CharacterFormData, type RuleItemResponse } from '@rpgforce-ai/shared';
import { useAllSpells } from '../../../sections/spellcasting/hooks/use-all-spells';
import { SpellAccordionRow } from '../shared/spell-accordion-row';
import { SelectionSection } from '../shared/selection';
import {
  SpellLevelAccordion,
  SpellPickerScroll,
  useSpellRowExpansion,
} from '../shared/spell-picker';

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
  const { expandedSpellIds, toggleExpand, resetExpanded } = useSpellRowExpansion();

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
    resetExpanded();
    setLevelAccordionOpen(true);
  }, [slotIndex, requiredSpellLevel, resetExpanded]);

  const spellsForSlot = React.useMemo(
    () =>
      warlockSpells
        .filter((s) => ruleItemSpellLevel(s) === requiredSpellLevel)
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
        <SpellPickerScroll>
          <SpellLevelAccordion
            label={getSpellListLevelLabel(requiredSpellLevel)}
            open={levelAccordionOpen}
            onToggle={() => setLevelAccordionOpen((o) => !o)}
          >
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
                    // Limit 1 per slot: clear the current pick before choosing another (no auto-swap).
                    disabled: !isRowSelected && selectedName != null,
                  }}
                />
              );
            })}
          </SpellLevelAccordion>
        </SpellPickerScroll>
      )}
    </SelectionSection>
  );
}
