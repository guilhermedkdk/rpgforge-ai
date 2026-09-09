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
  SpellLevelAccordion,
  SpellLevelBox,
  SpellPickerScroll,
  useSpellRowExpansion,
} from '../shared/spell-picker';

const SIGNATURE_SPELLS_SLOT_COUNT = 2;
const SIGNATURE_SPELLS_SPELL_LEVEL = 3;

interface SignatureSpellsSpellPickerPanelProps {
  data: CharacterFormData;
  onChange: (d: CharacterFormData) => void;
  classes: RuleItemResponse[];
}

export function SignatureSpellsSpellPickerPanel({
  data,
  onChange,
  classes,
}: SignatureSpellsSpellPickerPanelProps) {
  const [levelAccordionOpen, setLevelAccordionOpen] = React.useState(true);
  const { expandedSpellIds, toggleExpand, resetExpanded } = useSpellRowExpansion();
  const levelLabel = getSpellListLevelLabel(SIGNATURE_SPELLS_SPELL_LEVEL);

  const spellbookLevel3NameSet = React.useMemo(() => {
    const L = SIGNATURE_SPELLS_SPELL_LEVEL;
    const fromLevel = data.wizardSpellbookByLevel?.[L] ?? [];
    const fromScroll = data.wizardSpellbookByScrollByLevel?.[L] ?? [];
    const fromSavant = data.evocationSavantSpellbookByLevel?.[L] ?? [];
    const set = new Set<string>();
    for (const n of [...fromLevel, ...fromScroll, ...fromSavant]) {
      const t = String(n ?? '')
        .trim()
        .toLowerCase();
      if (t) set.add(t);
    }
    return set;
  }, [
    data.wizardSpellbookByLevel,
    data.wizardSpellbookByScrollByLevel,
    data.evocationSavantSpellbookByLevel,
  ]);

  const spellbookL3ListKey = React.useMemo(
    () => [...spellbookLevel3NameSet].sort().join('\n'),
    [spellbookLevel3NameSet]
  );

  const classItem = classes.find((c) => c.id === data.classRuleItemId);
  const { allSpells, allSpellsLoading: loading } = useAllSpells(classItem?.packId ?? null);

  const spellsForPicker = React.useMemo(
    () =>
      spellbookLevel3NameSet.size === 0
        ? []
        : allSpells
            .filter(
              (s) =>
                ruleItemSpellLevel(s) === SIGNATURE_SPELLS_SPELL_LEVEL &&
                spellbookLevel3NameSet.has(s.name.trim().toLowerCase())
            )
            .sort((a, b) => a.name.localeCompare(b.name)),
    [allSpells, spellbookLevel3NameSet]
  );

  const ensureSlots = (d: CharacterFormData): (string | null)[] =>
    Array.from(
      { length: SIGNATURE_SPELLS_SLOT_COUNT },
      (_, i) => (d.signatureSpellsSpellNames ?? [])[i] ?? null
    );

  const bySlot = ensureSlots(data);
  const selectedFilledCount = bySlot.filter((x) => String(x ?? '').trim()).length;

  const spellNameSelected = (spellName: string) => {
    const k = spellName.trim().toLowerCase();
    return bySlot.some(
      (x) =>
        String(x ?? '')
          .trim()
          .toLowerCase() === k
    );
  };

  const removeSpellFromSelection = (spellName: string) => {
    const next = ensureSlots(data);
    const k = spellName.trim().toLowerCase();
    for (let i = 0; i < SIGNATURE_SPELLS_SLOT_COUNT; i++) {
      if (
        String(next[i] ?? '')
          .trim()
          .toLowerCase() === k
      )
        next[i] = null;
    }
    onChange({ ...data, signatureSpellsSpellNames: next });
  };

  const addSpellToSelection = (spellName: string) => {
    const trimmed = spellName.trim();
    if (!trimmed) return;
    const k = trimmed.toLowerCase();
    const next = ensureSlots(data);
    if (
      next.some(
        (x) =>
          String(x ?? '')
            .trim()
            .toLowerCase() === k
      )
    )
      return;
    const firstEmpty = next.findIndex((x) => !String(x ?? '').trim());
    if (firstEmpty < 0) return;
    next[firstEmpty] = trimmed;
    onChange({ ...data, signatureSpellsSpellNames: next });
  };

  React.useEffect(() => {
    resetExpanded();
    setLevelAccordionOpen(true);
  }, [spellbookL3ListKey, classItem?.packId, resetExpanded]);

  if (!classItem) {
    return (
      <SelectionSection>
        <SpellLevelBox label={levelLabel} message={NO_CLASS_MESSAGE} />
      </SelectionSection>
    );
  }

  return (
    <SelectionSection className="flex min-h-0 min-w-0 flex-1 flex-col">
      {loading ? (
        <LoadingState inline className="justify-center py-4" />
      ) : spellbookLevel3NameSet.size === 0 ? (
        <SpellLevelBox label={levelLabel} message="No level 3 spells in your spellbook yet." />
      ) : spellsForPicker.length === 0 ? (
        <SpellLevelBox
          label={levelLabel}
          message="No matching spells in this pack for your level 3 spellbook entries."
        />
      ) : (
        <SpellPickerScroll>
          <SpellLevelAccordion
            label={levelLabel}
            open={levelAccordionOpen}
            onToggle={() => setLevelAccordionOpen((o) => !o)}
          >
            {spellsForPicker.map((spell) => {
              const isRowSelected = spellNameSelected(spell.name);
              const selectDisabled =
                !isRowSelected && selectedFilledCount >= SIGNATURE_SPELLS_SLOT_COUNT;
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
        </SpellPickerScroll>
      )}
    </SelectionSection>
  );
}
