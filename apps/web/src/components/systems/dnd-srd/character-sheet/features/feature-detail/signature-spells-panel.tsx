'use client';

import * as React from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { LoadingState } from '@/components/ui/loading-state';
import type { RuleItemResponse } from '@rpgforce-ai/shared';
import type { CharacterFormData } from '@/lib/dnd-srd/character-state';
import { useAllSpells } from '../../sections/spellcasting/use-all-spells';
import { SpellAccordionRow } from './spell-accordion-row';
import { SelectionSection } from './feature-detail-primitives';

const SIGNATURE_SPELLS_SLOT_COUNT = 2;
const SIGNATURE_SPELLS_SPELL_LEVEL = 3;

function signatureSpellsRuleItemLevel(s: RuleItemResponse): number {
  const n = (s.normalized ?? {}) as Record<string, unknown>;
  const lvl = Number(n.level ?? 0);
  return Number.isFinite(lvl) ? Math.max(0, Math.min(9, Math.floor(lvl))) : 0;
}

const getLevelLabel = (level: number) => (level === 0 ? 'Cantrips' : `Level ${level}`);

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
  const [expandedSpellIds, setExpandedSpellIds] = React.useState<Set<string>>(new Set());

  const spellbookLevel3NameSet = React.useMemo(() => {
    const L = SIGNATURE_SPELLS_SPELL_LEVEL;
    const fromLevel = data.wizardSpellbookByLevel?.[L] ?? [];
    const fromScroll = data.wizardSpellbookByScrollByLevel?.[L] ?? [];
    const set = new Set<string>();
    for (const n of [...fromLevel, ...fromScroll]) {
      const t = String(n ?? '').trim().toLowerCase();
      if (t) set.add(t);
    }
    return set;
  }, [data.wizardSpellbookByLevel, data.wizardSpellbookByScrollByLevel]);

  const spellbookL3ListKey = React.useMemo(
    () => [...spellbookLevel3NameSet].sort().join('\n'),
    [spellbookLevel3NameSet],
  );

  const classItem = classes.find((c) => c.id === data.classRuleItemId);
  const { allSpells, allSpellsLoading: loading } = useAllSpells(classItem?.packId ?? null);
  const packLevel3Spells = React.useMemo(
    () => allSpells.filter((s) => signatureSpellsRuleItemLevel(s) === SIGNATURE_SPELLS_SPELL_LEVEL),
    [allSpells],
  );

  const spellsForPicker = React.useMemo(
    () =>
      spellbookLevel3NameSet.size === 0
        ? []
        : packLevel3Spells
            .filter(
              (s) =>
                signatureSpellsRuleItemLevel(s) === SIGNATURE_SPELLS_SPELL_LEVEL &&
                spellbookLevel3NameSet.has(s.name.trim().toLowerCase()),
            )
            .sort((a, b) => a.name.localeCompare(b.name)),
    [packLevel3Spells, spellbookLevel3NameSet],
  );

  const ensureSlots = (d: CharacterFormData): (string | null)[] =>
    Array.from(
      { length: SIGNATURE_SPELLS_SLOT_COUNT },
      (_, i) => (d.signatureSpellsSpellNames ?? [])[i] ?? null,
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
    for (let i = 0; i < SIGNATURE_SPELLS_SLOT_COUNT; i++) {
      if (String(next[i] ?? '').trim().toLowerCase() === k) next[i] = null;
    }
    onChange({ ...data, signatureSpellsSpellNames: next });
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
    onChange({ ...data, signatureSpellsSpellNames: next });
  };

  React.useEffect(() => {
    setExpandedSpellIds(new Set());
    setLevelAccordionOpen(true);
  }, [spellbookL3ListKey, classItem?.packId]);

  const toggleExpand = (id: string) =>
    setExpandedSpellIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (!classItem) {
    return (
      <SelectionSection>
        <div className="overflow-hidden rounded-lg border border-border/60">
          <div className="bg-muted/40 px-3 py-2">
            <span className="font-serif text-sm font-semibold leading-none text-foreground">
              {getLevelLabel(SIGNATURE_SPELLS_SPELL_LEVEL)}
            </span>
          </div>
          <div className="border-t border-border/30">
            <p className="px-3 py-3 text-xs text-muted-foreground">
              Select a class on your sheet to load spells from your pack.
            </p>
          </div>
        </div>
      </SelectionSection>
    );
  }

  return (
    <SelectionSection className="flex min-h-0 min-w-0 flex-1 flex-col">
      {loading ? (
        <LoadingState inline className="justify-center py-4" />
      ) : spellbookLevel3NameSet.size === 0 ? (
        <div className="overflow-hidden rounded-lg border border-border/60">
          <div className="bg-muted/40 px-3 py-2">
            <span className="font-serif text-sm font-semibold leading-none text-foreground">
              {getLevelLabel(SIGNATURE_SPELLS_SPELL_LEVEL)}
            </span>
          </div>
          <div className="border-t border-border/30">
            <p className="px-3 py-3 text-xs text-muted-foreground">
              No level 3 spells in your spellbook yet.
            </p>
          </div>
        </div>
      ) : spellsForPicker.length === 0 ? (
        <div className="overflow-hidden rounded-lg border border-border/60">
          <div className="bg-muted/40 px-3 py-2">
            <span className="font-serif text-sm font-semibold leading-none text-foreground">
              {getLevelLabel(SIGNATURE_SPELLS_SPELL_LEVEL)}
            </span>
          </div>
          <div className="border-t border-border/30">
            <p className="px-3 py-3 text-xs text-muted-foreground">
              No matching spells in this pack for your level 3 spellbook entries.
            </p>
          </div>
        </div>
      ) : (
        <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto overflow-x-hidden pr-1">
          <div className="overflow-hidden rounded-lg border border-border/60">
            <button
              type="button"
              onClick={() => setLevelAccordionOpen((o) => !o)}
              className="cursor-pointer flex w-full items-center justify-between bg-muted/40 px-3 py-2.5 text-left transition-colors hover:bg-muted/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="font-serif text-lg font-semibold leading-none text-foreground">
                {getLevelLabel(SIGNATURE_SPELLS_SPELL_LEVEL)}
              </span>
              {levelAccordionOpen ? (
                <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              )}
            </button>

            {levelAccordionOpen && (
              <div className="divide-y divide-border/30">
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
              </div>
            )}
          </div>
        </div>
      )}
    </SelectionSection>
  );
}
