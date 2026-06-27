'use client';

import * as React from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { LoadingState } from '@/components/ui/loading-state';
import type { RuleItemResponse } from '@rpgforce-ai/shared';
import type { CharacterFormData } from '@/lib/dnd-srd/character-state';
import { ruleItemsApi } from '@/lib/api/rule-items';
import { SpellAccordionRow } from './spell-accordion-row';
import { SelectionSection } from './feature-detail-primitives';

const SPELL_MASTERY_LEVELS = [1, 2] as const;
const getLevelLabel = (level: number) => (level === 0 ? 'Cantrips' : `Level ${level}`);

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
  const [packL1Spells, setPackL1Spells] = React.useState<RuleItemResponse[]>([]);
  const [packL2Spells, setPackL2Spells] = React.useState<RuleItemResponse[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [expandedSpellIds, setExpandedSpellIds] = React.useState<Set<string>>(new Set());
  const [openLevels, setOpenLevels] = React.useState<Set<number>>(new Set([1, 2]));

  const classItem = classes.find((c) => c.id === data.classRuleItemId);
  React.useEffect(() => {
    if (!classItem?.packId) {
      setPackL1Spells([]);
      setPackL2Spells([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    Promise.all([
      ruleItemsApi.getList({ type: 'SPELL', packId: classItem.packId, level: 1, limit: 500 }),
      ruleItemsApi.getList({ type: 'SPELL', packId: classItem.packId, level: 2, limit: 500 }),
    ])
      .then(([l1, l2]) => {
        if (cancelled) return;
        setPackL1Spells(l1.items);
        setPackL2Spells(l2.items);
      })
      .catch(() => {
        if (cancelled) return;
        setPackL1Spells([]);
        setPackL2Spells([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [classItem?.packId]);

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
    () => SPELL_MASTERY_LEVELS.map((lvl) => [...spellbookNamesByLevel[lvl]].sort().join('|')).join('\n'),
    [spellbookNamesByLevel],
  );

  const spellsForLevel = React.useMemo(() => {
    const out: Record<number, RuleItemResponse[]> = { 1: [], 2: [] };
    const byPack: Record<number, RuleItemResponse[]> = { 1: packL1Spells, 2: packL2Spells };
    for (const lvl of SPELL_MASTERY_LEVELS) {
      out[lvl] =
        spellbookNamesByLevel[lvl].size === 0
          ? []
          : byPack[lvl]
              .filter((s) => spellbookNamesByLevel[lvl].has(s.name.trim().toLowerCase()))
              .sort((a, b) => a.name.localeCompare(b.name));
    }
    return out;
  }, [packL1Spells, packL2Spells, spellbookNamesByLevel]);

  React.useEffect(() => {
    setExpandedSpellIds(new Set());
    setOpenLevels(new Set([1, 2]));
  }, [spellbookKey, classItem?.packId]);

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
              Spell Mastery
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
        <LoadingState inline label="Loading spells…" className="justify-center py-4" />
      ) : (
        <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto overflow-x-hidden pr-1">
          {SPELL_MASTERY_LEVELS.map((lvl) => {
            const rows = spellsForLevel[lvl] ?? [];
            const selectedName = selectedByLevel[lvl];
            const levelOpen = openLevels.has(lvl);
            return (
              <div key={`spell-mastery-level-${lvl}`} className="overflow-hidden rounded-lg border border-border/60">
                <button
                  type="button"
                  onClick={() =>
                    setOpenLevels((prev) => {
                      const next = new Set(prev);
                      if (next.has(lvl)) next.delete(lvl);
                      else next.add(lvl);
                      return next;
                    })
                  }
                  className="cursor-pointer flex w-full items-center justify-between bg-muted/40 px-3 py-2.5 text-left transition-colors hover:bg-muted/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="font-serif text-lg font-semibold leading-none text-foreground">
                    {getLevelLabel(lvl)}
                  </span>
                  {levelOpen ? (
                    <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                </button>
                {levelOpen && (
                  <div className="divide-y divide-border/30">
                    {spellbookNamesByLevel[lvl].size === 0 ? (
                      <p className="px-3 py-3 text-xs text-muted-foreground">
                        No level {lvl} spells in your spellbook yet.
                      </p>
                    ) : rows.length === 0 ? (
                      <p className="px-3 py-3 text-xs text-muted-foreground">
                        No matching spells in this pack for your level {lvl} spellbook entries.
                      </p>
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
                            }}
                          />
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </SelectionSection>
  );
}
