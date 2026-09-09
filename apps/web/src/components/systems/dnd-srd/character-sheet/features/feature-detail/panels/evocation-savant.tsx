'use client';

import * as React from 'react';
import { LoadingState } from '@/components/ui/loading-state';
import {
  evocationSavantFreeSpellCount,
  evocationSavantIncrementalFreeCount,
  EVOCATION_SAVANT_BASE_MAX_LEVEL,
  fullCasterMaxSpellLevel,
  ruleItemSpellLevel,
  spellsForClass,
  getSpellListLevelLabel,
  type RuleItemResponse,
  type CharacterFormData,
} from '@rpgforce-ai/shared';
import { useAllSpells } from '../../../sections/spellcasting/hooks/use-all-spells';
import { SpellAccordionRow } from '../shared/spell-accordion-row';
import { SelectionSection } from '../shared/selection';
import {
  SpellLevelAccordion,
  SpellPickerScroll,
  useSpellRowExpansion,
} from '../shared/spell-picker';

const EVOCATION_SCHOOL_TAG = 'spell:school:evocation';

/**
 * Evocation Savant (Evoker): Wizard Evocation spells that enter the spellbook for free:
 * 2 on taking the subclass + 1 per new slot level (see `evocationSavantFreeSpellCount`).
 * Only offers levels the character casts today; stored by level in their own bucket, so they
 * don't consume the spellbook's normal capacity.
 */
export function EvocationSavantPanel({
  data,
  onChange,
  classes,
}: {
  data: CharacterFormData;
  onChange: (d: CharacterFormData) => void;
  classes: RuleItemResponse[];
}) {
  const [openLevels, setOpenLevels] = React.useState<Set<number>>(() => new Set([1]));
  const { expandedSpellIds, toggleExpand } = useSpellRowExpansion();

  const classItem = classes.find((c) => c.id === data.classRuleItemId);
  const { allSpells, allSpellsLoading } = useAllSpells(classItem?.packId ?? null);
  const characterLevel = data.level ?? 1;
  const maxSpellLevel = fullCasterMaxSpellLevel(characterLevel);
  const freeSpellCount = evocationSavantFreeSpellCount(characterLevel);
  // Only the incremental picks may exceed level 2; the base 2 are locked to level <= 2.
  const incrementalFreeCount = evocationSavantIncrementalFreeCount(characterLevel);

  // Only Wizard-list Evocation spells; the spellbook holds only level 1+ (cantrips don't enter).
  const poolByLevel = React.useMemo(() => {
    const grouped = new Map<number, RuleItemResponse[]>();
    for (const s of spellsForClass(allSpells, 'Wizard')) {
      if (!s.tagKeys.includes(EVOCATION_SCHOOL_TAG)) continue;
      const lvl = ruleItemSpellLevel(s);
      if (lvl < 1 || lvl > maxSpellLevel) continue;
      grouped.set(lvl, [...(grouped.get(lvl) ?? []), s]);
    }
    for (const list of grouped.values()) list.sort((a, b) => a.name.localeCompare(b.name));
    return grouped;
  }, [allSpells, maxSpellLevel]);

  const byLevel = data.evocationSavantSpellbookByLevel ?? {};
  const pickedCount = React.useMemo(() => {
    let total = 0;
    for (let lvl = 1; lvl <= 9; lvl++) total += (byLevel[lvl] ?? []).length;
    return total;
  }, [byLevel]);
  // Picks above the base level (level > 2) — these consume the incremental allowance.
  const highLevelPickedCount = React.useMemo(() => {
    let total = 0;
    for (let lvl = EVOCATION_SAVANT_BASE_MAX_LEVEL + 1; lvl <= 9; lvl++)
      total += (byLevel[lvl] ?? []).length;
    return total;
  }, [byLevel]);

  const isPicked = (level: number, spellName: string) =>
    (byLevel[level] ?? []).some((n) => n.trim().toLowerCase() === spellName.trim().toLowerCase());

  const togglePick = (level: number, spellName: string) => {
    const current = byLevel[level] ?? [];
    const k = spellName.trim().toLowerCase();
    const next = current.some((n) => n.trim().toLowerCase() === k)
      ? current.filter((n) => n.trim().toLowerCase() !== k)
      : [...current, spellName.trim()];
    onChange({
      ...data,
      evocationSavantSpellbookByLevel: { ...byLevel, [level]: next },
    });
  };

  const levels = [...poolByLevel.keys()].sort((a, b) => a - b);

  if (!classItem) {
    return (
      <SelectionSection>
        <p className="text-xs text-muted-foreground">
          Select the Wizard class on your sheet to choose Evocation spells.
        </p>
      </SelectionSection>
    );
  }

  return (
    <SelectionSection className="flex min-h-0 min-w-0 flex-1 flex-col">
      {allSpellsLoading ? (
        <LoadingState inline className="justify-center py-4" />
      ) : levels.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No Wizard Evocation spells of a level you can cast were found in this pack.
        </p>
      ) : (
        <SpellPickerScroll>
          {levels.map((level) => (
            <SpellLevelAccordion
              key={level}
              label={getSpellListLevelLabel(level)}
              open={openLevels.has(level)}
              onToggle={() =>
                setOpenLevels((prev) => {
                  const next = new Set(prev);
                  if (next.has(level)) next.delete(level);
                  else next.add(level);
                  return next;
                })
              }
            >
              {(poolByLevel.get(level) ?? []).map((spell) => {
                const isRowSelected = isPicked(level, spell.name);
                // Blocked when the total quota is full, OR (for level > 2) when the incremental
                // allowance is used up — the base 2 free spells must stay at level <= 2.
                const atTotalLimit = pickedCount >= freeSpellCount;
                const atHighLevelLimit =
                  level > EVOCATION_SAVANT_BASE_MAX_LEVEL &&
                  highLevelPickedCount >= incrementalFreeCount;
                const selectDisabled = !isRowSelected && (atTotalLimit || atHighLevelLimit);
                return (
                  <SpellAccordionRow
                    key={spell.id}
                    spell={spell}
                    isExpanded={expandedSpellIds.has(spell.id)}
                    isSelected={isRowSelected}
                    onToggleExpand={toggleExpand}
                    selectButton={{
                      label: isRowSelected ? 'Clear selection' : 'Select spell',
                      disabled: selectDisabled,
                      onClick: () => togglePick(level, spell.name),
                    }}
                  />
                );
              })}
            </SpellLevelAccordion>
          ))}
        </SpellPickerScroll>
      )}
    </SelectionSection>
  );
}
