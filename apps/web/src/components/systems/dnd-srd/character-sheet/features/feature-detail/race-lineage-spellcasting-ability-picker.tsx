'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import type { CharacterFormData } from '@/lib/dnd-srd/character-state';

const RACE_LINEAGE_SPELLCASTING_ABILITIES = ['Intelligence', 'Wisdom', 'Charisma'] as const;

interface RaceLineageSpellcastingAbilityPickerProps {
  data: CharacterFormData;
  onChange: (d: CharacterFormData) => void;
  featureName: string;
}

/** Int/Wis/Cha picker for spells/cantrips granted by Elven Lineage / Gnomish Lineage / Fiendish Legacy. */
export function RaceLineageSpellcastingAbilityPicker({
  data,
  onChange,
  featureName,
}: RaceLineageSpellcastingAbilityPickerProps) {
  const selected = data.raceLineageSpellcastingAbility?.[featureName] ?? null;

  return (
    <div className="space-y-1.5">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Spellcasting Ability
      </p>
      <div className="flex gap-2">
        {RACE_LINEAGE_SPELLCASTING_ABILITIES.map((ability) => (
          <button
            key={ability}
            type="button"
            onClick={() =>
              onChange({
                ...data,
                raceLineageSpellcastingAbility: {
                  ...(data.raceLineageSpellcastingAbility ?? {}),
                  [featureName]: ability,
                },
              })
            }
            className={cn(
              'flex-1 cursor-pointer rounded-md border px-2 py-1.5 text-sm font-medium transition-colors',
              selected === ability
                ? 'border-primary/70 bg-primary/5 text-primary'
                : 'border-border bg-card text-foreground hover:bg-muted/40',
            )}
          >
            {ability}
          </button>
        ))}
      </div>
    </div>
  );
}
