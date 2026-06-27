'use client';

import { useQuery } from '@tanstack/react-query';
import { ruleItemsApi } from '@/lib/api/rule-items';
import type { RuleItemResponse } from '@rpgforce-ai/shared';

const EMPTY_SPELLS: RuleItemResponse[] = [];

/** Tag a spell carries for each class that can cast it (set on ingestion from `raw.classes`). */
export const spellClassTag = (className: string): string =>
  `spell:class:${className.trim().toLowerCase().replace(/\s+/g, '-')}`;

/** Spells castable by `className`, sliced from a full catalog by class tag. */
export const spellsForClass = (
  spells: RuleItemResponse[],
  className: string,
): RuleItemResponse[] => spells.filter((s) => s.tagKeys.includes(spellClassTag(className)));

/**
 * Full spell catalog (lean) for a pack, shared via React Query: the spellcasting section and every
 * feature panel that needs spells call this with the same key, so one request is made and each
 * slices its own class list by tag. Spells are static within a session — never refetched.
 */
export function useAllSpells(spellPackId: string | null | undefined) {
  const { data, isLoading } = useQuery({
    queryKey: ['rule-items', spellPackId, 'spells-all'],
    queryFn: () =>
      ruleItemsApi
        .getList({ type: 'SPELL', packId: spellPackId as string, limit: 500, includeRaw: false })
        .then((r) => r.items),
    enabled: !!spellPackId,
    staleTime: Infinity,
  });
  return { allSpells: data ?? EMPTY_SPELLS, allSpellsLoading: isLoading };
}
