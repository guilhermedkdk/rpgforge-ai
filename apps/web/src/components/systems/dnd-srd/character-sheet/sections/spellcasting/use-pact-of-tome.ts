'use client';

import * as React from 'react';
import type { CharacterFormData } from '@/lib/dnd-srd/character-state';
import {
  PACT_OF_TOME_MAX_CANTRIPS,
  PACT_OF_TOME_MAX_RITUALS,
} from '@/lib/dnd-srd/eldritch-invocations';

/** Book of Shadows (Pact of the Tome): 3 cantrips + 2 level-1 ritual spells from any class. */
export const PACT_OF_TOME_GRANT_SOURCE = 'Pact of the Tome';

const normalizeNames = (src: string[] | undefined): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const name of src ?? []) {
    const trimmed = String(name ?? '').trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
};

interface UsePactOfTomeArgs {
  data: CharacterFormData;
  onChange: (data: CharacterFormData) => void;
}

/** Book of Shadows state: chosen cantrips and level-1 ritual spell names. */
export function usePactOfTome({ data, onChange }: UsePactOfTomeArgs) {
  const cantrips = React.useMemo(
    () => normalizeNames(data.pactOfTomeSpellNames?.cantrips),
    [data.pactOfTomeSpellNames?.cantrips]
  );
  const rituals = React.useMemo(
    () => normalizeNames(data.pactOfTomeSpellNames?.rituals),
    [data.pactOfTomeSpellNames?.rituals]
  );

  const canAddCantrip = cantrips.length < PACT_OF_TOME_MAX_CANTRIPS;
  const canAddRitual = rituals.length < PACT_OF_TOME_MAX_RITUALS;

  const commit = React.useCallback(
    (next: { cantrips: string[]; rituals: string[] }) =>
      onChange({ ...data, pactOfTomeSpellNames: next }),
    [data, onChange]
  );

  const addCantrip = React.useCallback(
    (name: string) => {
      const trimmed = name.trim();
      if (!trimmed || cantrips.length >= PACT_OF_TOME_MAX_CANTRIPS) return;
      if (cantrips.some((n) => n.toLowerCase() === trimmed.toLowerCase())) return;
      commit({ cantrips: [...cantrips, trimmed], rituals });
    },
    [cantrips, rituals, commit]
  );

  const removeCantrip = React.useCallback(
    (name: string) => {
      const low = name.trim().toLowerCase();
      commit({ cantrips: cantrips.filter((n) => n.toLowerCase() !== low), rituals });
    },
    [cantrips, rituals, commit]
  );

  const addRitual = React.useCallback(
    (name: string) => {
      const trimmed = name.trim();
      if (!trimmed || rituals.length >= PACT_OF_TOME_MAX_RITUALS) return;
      if (rituals.some((n) => n.toLowerCase() === trimmed.toLowerCase())) return;
      commit({ cantrips, rituals: [...rituals, trimmed] });
    },
    [cantrips, rituals, commit]
  );

  const removeRitual = React.useCallback(
    (name: string) => {
      const low = name.trim().toLowerCase();
      commit({ cantrips, rituals: rituals.filter((n) => n.toLowerCase() !== low) });
    },
    [cantrips, rituals, commit]
  );

  return {
    cantrips,
    rituals,
    maxCantrips: PACT_OF_TOME_MAX_CANTRIPS,
    maxRituals: PACT_OF_TOME_MAX_RITUALS,
    canAddCantrip,
    canAddRitual,
    addCantrip,
    removeCantrip,
    addRitual,
    removeRitual,
  };
}
