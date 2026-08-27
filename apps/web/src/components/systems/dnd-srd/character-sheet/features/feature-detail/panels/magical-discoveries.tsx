'use client';

import * as React from 'react';
import { LoadingState } from '@/components/ui/loading-state';
import {
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
import { SpellLevelAccordion, SpellPickerScroll, useSpellRowExpansion } from '../shared/spell-picker';

const MAGICAL_DISCOVERIES_LISTS = ['Cleric', 'Druid', 'Wizard'] as const;
const MAGICAL_DISCOVERIES_PICKS = 2;

/**
 * Magical Discoveries (College of Lore): 2 spells (cantrip or castable level) from the Cleric,
 * Druid or Wizard lists, always prepared. Same mechanic as Signature Spells (select/clear up to
 * the limit), with the pool grouped by level because it spans cantrips + castable levels.
 */
export function MagicalDiscoveriesPanel({
  data,
  onChange,
  classes,
}: {
  data: CharacterFormData;
  onChange: (d: CharacterFormData) => void;
  classes: RuleItemResponse[];
}) {
  const [openLevels, setOpenLevels] = React.useState<Set<number>>(() => new Set([0]));
  const { expandedSpellIds, toggleExpand } = useSpellRowExpansion();

  const classItem = classes.find((c) => c.id === data.classRuleItemId);
  const { allSpells, allSpellsLoading } = useAllSpells(classItem?.packId ?? null);
  const maxSpellLevel = fullCasterMaxSpellLevel(data.level ?? 1);

  const poolByLevel = React.useMemo(() => {
    const byId = new Map<string, RuleItemResponse>();
    for (const list of MAGICAL_DISCOVERIES_LISTS) {
      for (const s of spellsForClass(allSpells, list)) {
        if (!byId.has(s.id)) byId.set(s.id, s);
      }
    }
    const grouped = new Map<number, RuleItemResponse[]>();
    for (const s of byId.values()) {
      const lvl = ruleItemSpellLevel(s);
      if (lvl > maxSpellLevel) continue;
      grouped.set(lvl, [...(grouped.get(lvl) ?? []), s]);
    }
    for (const list of grouped.values()) list.sort((a, b) => a.name.localeCompare(b.name));
    return grouped;
  }, [allSpells, maxSpellLevel]);

  const ensureSlots = (d: CharacterFormData): (string | null)[] =>
    Array.from(
      { length: MAGICAL_DISCOVERIES_PICKS },
      (_, i) => (d.magicalDiscoveriesSpellNames ?? [])[i] ?? null,
    );

  const bySlot = ensureSlots(data);
  const selectedFilledCount = bySlot.filter((x) => String(x ?? '').trim()).length;

  const spellNameSelected = (spellName: string) => {
    const k = spellName.trim().toLowerCase();
    return bySlot.some((x) => String(x ?? '').trim().toLowerCase() === k);
  };

  const removeSpellFromSelection = (spellName: string) => {
    const next = ensureSlots(data);
    const k = spellName.trim().toLowerCase();
    for (let i = 0; i < MAGICAL_DISCOVERIES_PICKS; i++) {
      if (String(next[i] ?? '').trim().toLowerCase() === k) next[i] = null;
    }
    onChange({ ...data, magicalDiscoveriesSpellNames: next });
  };

  const addSpellToSelection = (spellName: string) => {
    const trimmed = spellName.trim();
    if (!trimmed) return;
    const k = trimmed.toLowerCase();
    const next = ensureSlots(data);
    if (next.some((x) => String(x ?? '').trim().toLowerCase() === k)) return;
    const firstEmpty = next.findIndex((x) => !String(x ?? '').trim());
    if (firstEmpty < 0) return;
    next[firstEmpty] = trimmed;
    onChange({ ...data, magicalDiscoveriesSpellNames: next });
  };

  const levels = [...poolByLevel.keys()].sort((a, b) => a - b);

  if (!classItem) {
    return (
      <SelectionSection>
        <p className="text-xs text-muted-foreground">
          Select a class on your sheet to load spells from your pack.
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
          No Cleric, Druid or Wizard spells found in this pack.
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
                const isRowSelected = spellNameSelected(spell.name);
                const selectDisabled =
                  !isRowSelected && selectedFilledCount >= MAGICAL_DISCOVERIES_PICKS;
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
                      onClick: () =>
                        isRowSelected
                          ? removeSpellFromSelection(spell.name)
                          : addSpellToSelection(spell.name),
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
