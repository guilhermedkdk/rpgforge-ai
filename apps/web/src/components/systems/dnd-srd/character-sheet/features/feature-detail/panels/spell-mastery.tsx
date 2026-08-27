'use client';

import * as React from 'react';
import { LoadingState } from '@/components/ui/loading-state';
import {
  ruleItemSpellLevel,
  getSpellListLevelLabel,
  type RuleItemResponse,
  type CharacterFormData,
} from '@rpgforce-ai/shared';
import { useAllSpells } from '../../../sections/spellcasting/hooks/use-all-spells';
import { SpellAccordionRow } from '../shared/spell-accordion-row';
import { SelectionSection } from '../shared/selection';
import {
  NO_CLASS_MESSAGE,
  SpellAccordionEmpty,
  SpellLevelAccordion,
  SpellLevelBox,
  SpellPickerScroll,
  useSpellRowExpansion,
} from '../shared/spell-picker';

const SPELL_MASTERY_LEVELS = [1, 2] as const;

interface SpellMasterySpellPickerPanelProps {
  data: CharacterFormData;
  onChange: (d: CharacterFormData) => void;
  classes: RuleItemResponse[];
}

export function SpellMasterySpellPickerPanel({
  data,
  onChange,
  classes,
}: SpellMasterySpellPickerPanelProps) {
  const { expandedSpellIds, toggleExpand, resetExpanded } = useSpellRowExpansion();
  const [openLevels, setOpenLevels] = React.useState<Set<number>>(new Set([1, 2]));

  const classItem = classes.find((c) => c.id === data.classRuleItemId);
  // Same shared catalog every other picker uses (one cached request per pack).
  const { allSpells, allSpellsLoading: loading } = useAllSpells(classItem?.packId ?? null);

  const spellbookNamesByLevel = React.useMemo(() => {
    const out: Record<number, Set<string>> = { 1: new Set(), 2: new Set() };
    for (const lvl of SPELL_MASTERY_LEVELS) {
      const fromLevel = data.wizardSpellbookByLevel?.[lvl] ?? [];
      const fromScroll = data.wizardSpellbookByScrollByLevel?.[lvl] ?? [];
      for (const n of [...fromLevel, ...fromScroll]) {
        const t = String(n ?? '').trim().toLowerCase();
        if (t) out[lvl].add(t);
      }
    }
    return out;
  }, [data.wizardSpellbookByLevel, data.wizardSpellbookByScrollByLevel]);

  const spellbookKey = React.useMemo(
    () =>
      SPELL_MASTERY_LEVELS.map((lvl) => [...spellbookNamesByLevel[lvl]].sort().join('|')).join('\n'),
    [spellbookNamesByLevel],
  );

  const spellsForLevel = React.useMemo(() => {
    const out: Record<number, RuleItemResponse[]> = { 1: [], 2: [] };
    for (const lvl of SPELL_MASTERY_LEVELS) {
      out[lvl] =
        spellbookNamesByLevel[lvl].size === 0
          ? []
          : allSpells
              .filter(
                (s) =>
                  ruleItemSpellLevel(s) === lvl &&
                  spellbookNamesByLevel[lvl].has(s.name.trim().toLowerCase()),
              )
              .sort((a, b) => a.name.localeCompare(b.name));
    }
    return out;
  }, [allSpells, spellbookNamesByLevel]);

  React.useEffect(() => {
    resetExpanded();
    setOpenLevels(new Set([1, 2]));
  }, [spellbookKey, classItem?.packId, resetExpanded]);

  const selectedByLevel = React.useMemo(() => {
    const src = data.spellMasterySpellNamesByLevel ?? {};
    return {
      1: String(src[1] ?? '').trim() || null,
      2: String(src[2] ?? '').trim() || null,
    } as const;
  }, [data.spellMasterySpellNamesByLevel]);

  const patchLevel = (level: 1 | 2, spellName: string | null) => {
    const prev = data.spellMasterySpellNamesByLevel ?? {};
    onChange({ ...data, spellMasterySpellNamesByLevel: { ...prev, [level]: spellName } });
  };

  if (!classItem) {
    return (
      <SelectionSection>
        <SpellLevelBox label="Spell Mastery" message={NO_CLASS_MESSAGE} />
      </SelectionSection>
    );
  }

  return (
    <SelectionSection className="flex min-h-0 min-w-0 flex-1 flex-col">
      {loading ? (
        <LoadingState inline className="justify-center py-4" />
      ) : (
        <SpellPickerScroll>
          {SPELL_MASTERY_LEVELS.map((lvl) => {
            const rows = spellsForLevel[lvl] ?? [];
            const selectedName = selectedByLevel[lvl];
            return (
              <SpellLevelAccordion
                key={`spell-mastery-level-${lvl}`}
                label={getSpellListLevelLabel(lvl)}
                open={openLevels.has(lvl)}
                onToggle={() =>
                  setOpenLevels((prev) => {
                    const next = new Set(prev);
                    if (next.has(lvl)) next.delete(lvl);
                    else next.add(lvl);
                    return next;
                  })
                }
              >
                {spellbookNamesByLevel[lvl].size === 0 ? (
                  <SpellAccordionEmpty message={`No level ${lvl} spells in your spellbook yet.`} />
                ) : rows.length === 0 ? (
                  <SpellAccordionEmpty
                    message={`No matching spells in this pack for your level ${lvl} spellbook entries.`}
                  />
                ) : (
                  rows.map((spell) => {
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
                          onClick: () => patchLevel(lvl, isRowSelected ? null : spell.name),
                          // Limit 1 per level: clear the current pick before choosing another (no auto-swap).
                          disabled: !isRowSelected && selectedName != null,
                        }}
                      />
                    );
                  })
                )}
              </SpellLevelAccordion>
            );
          })}
        </SpellPickerScroll>
      )}
    </SelectionSection>
  );
}
