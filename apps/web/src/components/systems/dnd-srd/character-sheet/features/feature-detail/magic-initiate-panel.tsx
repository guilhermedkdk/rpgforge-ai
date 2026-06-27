'use client';

import * as React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { RuleItemResponse } from '@rpgforce-ai/shared';
import {
  type CharacterFormData,
  type MagicInitiateGain,
  MAGIC_INITIATE_SPELL_LISTS,
  type MagicInitiateSpellList,
} from '@/lib/dnd-srd/character-state';
import { useAllSpells, spellsForClass } from '../../sections/spellcasting/use-all-spells';
import { SpellAccordionRow } from './spell-accordion-row';
import { SelectionSection } from './feature-detail-primitives';

const MAGIC_INITIATE_ABILITIES = ['Intelligence', 'Wisdom', 'Charisma'] as const;

function emptyGain(): MagicInitiateGain {
  return { spellList: null, cantripNames: [], spellName: null, spellcastingAbility: null };
}


interface MagicInitiatePanelProps {
  data: CharacterFormData;
  onChange: (d: CharacterFormData) => void;
  classes: RuleItemResponse[];
  races: RuleItemResponse[];
  /** Ordered stable source keys for each gain slot. Replaces gainCount. */
  sourceKeys: string[];
  gainedAtLevels?: number[];
  /** Source label per slot (e.g. 'Background', 'Versatile', 'Level 4'). Overrides gainedAtLevels in pager. */
  gainSourceLabels?: string[];
  /**
   * Per-slot locked spell list. When non-null for a slot, the spell list selector is hidden
   * and the value is pre-initialized and locked (e.g. background "Magic Initiate (Cleric)").
   */
  lockedSpellLists?: (MagicInitiateSpellList | null)[];
}

export function MagicInitiatePanel({
  data,
  onChange,
  classes,
  races,
  sourceKeys,
  gainedAtLevels,
  gainSourceLabels,
  lockedSpellLists,
}: MagicInitiatePanelProps) {
  const [pageIndex, setPageIndex] = React.useState(0);
  const [expandedSpellIds, setExpandedSpellIds] = React.useState<Set<string>>(new Set());

  const safeGainCount = Math.max(1, sourceKeys.length);
  const showPager = safeGainCount > 1;

  const slotIndex = Math.min(pageIndex, safeGainCount - 1);
  const currentKey = sourceKeys[slotIndex] ?? '';

  const gain: MagicInitiateGain = (data.magicInitiateChoicesBySource ?? {})[currentKey] ?? emptyGain();

  const lockedList = lockedSpellLists?.[slotIndex] ?? null;

  // When the slot has a locked spell list (e.g. background "Magic Initiate (Cleric)"),
  // auto-initialize the data so spell loading fires correctly.
  React.useEffect(() => {
    if (!lockedList || !currentKey) return;
    if (gain.spellList === lockedList) return;
    const newSource = {
      ...(data.magicInitiateChoicesBySource ?? {}),
      [currentKey]: { ...(data.magicInitiateChoicesBySource?.[currentKey] ?? emptyGain()), spellList: lockedList },
    };
    onChange({
      ...data,
      magicInitiateChoicesBySource: newSource,
      magicInitiateChoicesByGain: sourceKeys.map((k) => (newSource[k] ?? null) as MagicInitiateGain | null),
    });
  }, [slotIndex, lockedList]);

  const selectedList = lockedList ?? gain.spellList;
  const selectedCantrips = (gain.cantripNames ?? []).filter(Boolean) as string[];
  const selectedSpell = gain.spellName ?? null;

  const packId = React.useMemo(() => {
    const classItem = classes.find((c) => c.id === data.classRuleItemId);
    if (classItem?.packId) return classItem.packId;
    const raceItem = races.find((r) => r.id === data.raceRuleItemId);
    return raceItem?.packId ?? null;
  }, [classes, races, data.classRuleItemId, data.raceRuleItemId]);

  const { allSpells, allSpellsLoading } = useAllSpells(packId);
  const spells = React.useMemo(
    () => (selectedList ? spellsForClass(allSpells, selectedList) : []),
    [allSpells, selectedList],
  );
  const isLoading = allSpellsLoading && !!selectedList;

  const cantrips = React.useMemo(
    () =>
      spells
        .filter((s) => Number(((s.normalized ?? {}) as Record<string, unknown>).level ?? 0) === 0)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [spells],
  );

  const level1Spells = React.useMemo(
    () =>
      spells
        .filter((s) => Number(((s.normalized ?? {}) as Record<string, unknown>).level ?? 0) === 1)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [spells],
  );

  // Sets of spell names (lowercase) the character already has from non-MI sources,
  // or from other MI slots — prevents selecting duplicates.
  const { alreadyKnownCantripNamesLower, alreadyKnownSpell1NamesLower } = React.useMemo(() => {
    const allMiCantrips = new Set<string>();
    for (const g of (data.magicInitiateChoicesByGain ?? [])) {
      if (!g) continue;
      for (const n of (g.cantripNames ?? [])) { if (n) allMiCantrips.add(n.toLowerCase()); }
    }

    // Non-MI spells already on the sheet
    const cantripSet = new Set<string>();
    for (const entry of (data.spellsByLevel?.[0] ?? [])) {
      const nl = entry.name.toLowerCase();
      if (!allMiCantrips.has(nl)) cantripSet.add(nl);
    }
    // The MI level-1 spell is "always prepared" in addition to the character's normal
    // spells, so it's allowed to overlap with already-known/prepared spells — only
    // cross-slot MI duplicates are excluded below.
    const spell1Set = new Set<string>();

    // Other MI slots' choices (prevent cross-slot duplicates)
    const currentCantripNamesLower = new Set(
      (gain.cantripNames ?? []).filter(Boolean).map((n) => n!.toLowerCase()),
    );
    const currentSpellNameLower = gain.spellName?.toLowerCase() ?? null;
    for (const [key, g] of Object.entries(data.magicInitiateChoicesBySource ?? {})) {
      if (key === currentKey || !g) continue;
      for (const n of (g.cantripNames ?? [])) {
        if (!n) continue;
        const nl = n.toLowerCase();
        if (!currentCantripNamesLower.has(nl)) cantripSet.add(nl);
      }
      if (g.spellName) {
        const nl = g.spellName.toLowerCase();
        if (nl !== currentSpellNameLower) spell1Set.add(nl);
      }
    }

    return { alreadyKnownCantripNamesLower: cantripSet, alreadyKnownSpell1NamesLower: spell1Set };
  }, [data.spellsByLevel, data.magicInitiateChoicesByGain, data.magicInitiateChoicesBySource, currentKey, gain.cantripNames, gain.spellName]);

  const patchGain = (patch: Partial<MagicInitiateGain>) => {
    if (!currentKey) return;
    const newSource = {
      ...(data.magicInitiateChoicesBySource ?? {}),
      [currentKey]: { ...(data.magicInitiateChoicesBySource?.[currentKey] ?? emptyGain()), ...patch },
    };
    onChange({
      ...data,
      magicInitiateChoicesBySource: newSource,
      magicInitiateChoicesByGain: sourceKeys.map((k) => (newSource[k] ?? null) as MagicInitiateGain | null),
    });
  };

  const selectList = (list: MagicInitiateSpellList) => {
    if (list === selectedList) return;
    patchGain({ spellList: list, cantripNames: [], spellName: null });
    setExpandedSpellIds(new Set());
  };

  const toggleCantrip = (name: string) => {
    const current = [...selectedCantrips];
    const idx = current.findIndex((c) => c.toLowerCase() === name.toLowerCase());
    if (idx >= 0) {
      current.splice(idx, 1);
      patchGain({ cantripNames: current });
    } else if (current.length < 2) {
      patchGain({ cantripNames: [...current, name] });
    }
  };

  const toggleSpell1 = (name: string) => {
    patchGain({ spellName: selectedSpell?.toLowerCase() === name.toLowerCase() ? null : name });
  };

  const toggleExpand = (id: string) =>
    setExpandedSpellIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  React.useEffect(() => {
    setExpandedSpellIds(new Set());
  }, [slotIndex]);

  return (
    <SelectionSection className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
      {showPager && (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-muted/20 px-2 py-2">
          <button
            type="button"
            aria-label="Previous gain"
            disabled={slotIndex <= 0}
            onClick={() => setPageIndex((i) => Math.max(0, i - 1))}
            className={cn(
              'flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-background text-foreground transition-colors',
              slotIndex <= 0 ? 'cursor-not-allowed opacity-40' : 'cursor-pointer hover:bg-muted/60',
            )}
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </button>
          <p className="text-xs font-semibold text-foreground">
            {gainSourceLabels?.[slotIndex] != null
              ? gainSourceLabels[slotIndex]
              : gainedAtLevels?.[slotIndex] != null
                ? `Level ${gainedAtLevels[slotIndex]}`
                : `Magic Initiate ${slotIndex + 1} of ${safeGainCount}`}
          </p>
          <button
            type="button"
            aria-label="Next gain"
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

      {/* Spellcasting Ability */}
      <div className="space-y-1.5">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Spellcasting Ability
        </p>
        <div className="flex gap-2">
          {MAGIC_INITIATE_ABILITIES.map((ability) => (
            <button
              key={ability}
              type="button"
              onClick={() => patchGain({ spellcastingAbility: ability })}
              className={cn(
                'flex-1 cursor-pointer rounded-md border px-2 py-1.5 text-sm font-medium transition-colors',
                gain.spellcastingAbility === ability
                  ? 'border-primary/70 bg-primary/5 text-primary'
                  : 'border-border bg-card text-foreground hover:bg-muted/40',
              )}
            >
              {ability}
            </button>
          ))}
        </div>
      </div>

      {/* Spell List Selector */}
      <div className="space-y-1.5">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Spell List
        </p>
        <div className="flex gap-2">
          {MAGIC_INITIATE_SPELL_LISTS.map((list) => (
            <button
              key={list}
              type="button"
              onClick={() => !lockedList && selectList(list)}
              disabled={!!lockedList && list !== lockedList}
              className={cn(
                'flex-1 rounded-md border px-2 py-1.5 text-sm font-medium transition-colors',
                selectedList === list
                  ? 'border-primary/70 bg-primary/5 text-primary'
                  : 'border-border bg-card text-foreground',
                lockedList
                  ? list === lockedList
                    ? 'cursor-default'
                    : 'cursor-not-allowed opacity-40'
                  : 'cursor-pointer hover:bg-muted/40',
              )}
            >
              {list}
            </button>
          ))}
        </div>
      </div>

      {selectedList && isLoading ? (
        <div className="min-h-0 flex-1 space-y-3 overflow-hidden">
          {[{ label: 'Cantrips', rows: 4 }, { label: 'Level 1', rows: 5 }].map((section) => (
            <div key={section.label} className="overflow-hidden rounded-lg border border-border/60">
              <div className="bg-muted/40 px-3 py-2.5">
                <div className="h-4 w-20 animate-pulse rounded bg-muted" />
              </div>
              <div className="divide-y divide-border/30">
                {Array.from({ length: section.rows }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 px-3 py-2.5">
                    <div className="h-3.5 flex-1 animate-pulse rounded bg-muted" />
                    <div className="h-3 w-16 animate-pulse rounded bg-muted" />
                    <div className="h-7 w-16 shrink-0 animate-pulse rounded-md bg-muted" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : !selectedList ? null : (
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overflow-x-hidden pr-1">
          {cantrips.length > 0 && (
            <div className="overflow-hidden rounded-lg border border-border/60">
              <div className="bg-muted/40 px-3 py-2.5">
                <span className="font-serif text-base font-semibold text-foreground">
                  Cantrips
                </span>
              </div>
              <div className="divide-y divide-border/30">
                {cantrips
                  .filter((spell) => !alreadyKnownCantripNamesLower.has(spell.name.toLowerCase()))
                  .map((spell) => {
                  const nameLower = spell.name.toLowerCase();
                  const isSelected = selectedCantrips.some((c) => c.toLowerCase() === nameLower);
                  const atLimit = selectedCantrips.length >= 2;
                  return (
                    <SpellAccordionRow
                      key={spell.id}
                      spell={spell}
                      isExpanded={expandedSpellIds.has(spell.id)}
                      isSelected={isSelected}
                      onToggleExpand={toggleExpand}
                      selectButton={{
                        label: isSelected ? 'Deselect' : 'Select',
                        onClick: () => toggleCantrip(spell.name),
                        disabled: !isSelected && atLimit,
                      }}
                    />
                  );
                })}
              </div>
            </div>
          )}

          {level1Spells.length > 0 && (
            <div className="overflow-hidden rounded-lg border border-border/60">
              <div className="bg-muted/40 px-3 py-2.5">
                <span className="font-serif text-base font-semibold text-foreground">Level 1</span>
              </div>
              <div className="divide-y divide-border/30">
                {level1Spells
                  .filter((spell) => !alreadyKnownSpell1NamesLower.has(spell.name.toLowerCase()))
                  .map((spell) => {
                  const nameLower = spell.name.toLowerCase();
                  const isSelected = selectedSpell?.toLowerCase() === nameLower;
                  return (
                    <SpellAccordionRow
                      key={spell.id}
                      spell={spell}
                      isExpanded={expandedSpellIds.has(spell.id)}
                      isSelected={isSelected}
                      onToggleExpand={toggleExpand}
                      selectButton={{
                        label: isSelected ? 'Deselect' : 'Select',
                        onClick: () => toggleSpell1(spell.name),
                      }}
                    />
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </SelectionSection>
  );
}
