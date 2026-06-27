'use client';

import * as React from 'react';
import type { CharacterFormData, FightingStyleCantripGrant } from '@/lib/dnd-srd/character-state';
import { useAllSpells, spellsForClass } from '../../sections/spellcasting/use-all-spells';
import { LoadingState } from '@/components/ui/loading-state';
import { SpellAccordionRow } from './spell-accordion-row';
import { SelectionSection } from './feature-detail-primitives';

interface FightingStyleCantripPanelProps {
  data: CharacterFormData;
  onChange: (d: CharacterFormData) => void;
  /** Active grant config (spell list, ability, label, max) — see getFightingStyleCantripGrant. */
  grant: FightingStyleCantripGrant;
  /** Pack to load the cantrip list from (the character's class pack). */
  packId: string | null;
}

/**
 * Cantrip picker for the Fighting Style "Blessed Warrior" / "Druidic Warrior" options: choose the
 * granted cantrips from the fixed class list. Mirrors the Magic Initiate cantrip picker, but with a
 * locked spell list and spellcasting ability (both come from `grant`).
 */
export function FightingStyleCantripPanel({
  data,
  onChange,
  grant,
  packId,
}: FightingStyleCantripPanelProps) {
  const [expandedIds, setExpandedIds] = React.useState<Set<string>>(new Set());

  const { allSpells, allSpellsLoading: loading } = useAllSpells(packId);
  const spells = React.useMemo(
    () =>
      spellsForClass(allSpells, grant.spellList).filter(
        (s) => Number((s.normalized as Record<string, unknown> | undefined)?.level ?? 0) === 0,
      ),
    [allSpells, grant.spellList],
  );

  const cantrips = React.useMemo(
    () => [...spells].sort((a, b) => a.name.localeCompare(b.name)),
    [spells],
  );

  const selected = (data.fightingStyleCantrips ?? []).filter(Boolean);
  const atLimit = selected.length >= grant.max;

  const toggle = (name: string) => {
    const current = [...selected];
    const idx = current.findIndex((c) => c.toLowerCase() === name.toLowerCase());
    if (idx >= 0) current.splice(idx, 1);
    else if (current.length < grant.max) current.push(name);
    else return;
    onChange({ ...data, fightingStyleCantrips: current });
  };

  const toggleExpand = (id: string) =>
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <SelectionSection>
      {loading ? (
        <LoadingState inline label="Loading cantrips…" className="justify-center py-4" />
      ) : cantrips.length === 0 ? (
        <p className="py-4 text-center text-xs text-muted-foreground">No cantrips available.</p>
      ) : (
        <div className="max-h-80 divide-y divide-border/30 overflow-y-auto overflow-x-hidden rounded-lg border border-border/60">
          {cantrips.map((spell) => {
            const isSelected = selected.some((c) => c.toLowerCase() === spell.name.toLowerCase());
            return (
              <SpellAccordionRow
                key={spell.id}
                spell={spell}
                isExpanded={expandedIds.has(spell.id)}
                isSelected={isSelected}
                onToggleExpand={toggleExpand}
                selectButton={{
                  label: isSelected ? 'Clear selection' : 'Select cantrip',
                  onClick: () => toggle(spell.name),
                  disabled: !isSelected && atLimit,
                }}
              />
            );
          })}
        </div>
      )}
    </SelectionSection>
  );
}
