'use client';

import { useQuery } from '@tanstack/react-query';
import { ruleItemsApi } from '@/lib/api/rule-items';
import type { RuleItemBatchQuery, RuleItemResponse } from '@rpgforce-ai/shared';
import { useAllSpells } from '../../character-sheet/sections/spellcasting/use-all-spells';

const EMPTY_ITEMS: RuleItemResponse[] = [];

/** All lean (`includeRaw: false`): the browser reads `normalized` and `contentMd` only. */
const BROWSE_BATCH_QUERIES: readonly RuleItemBatchQuery[] = [
  { key: 'classes', type: 'CLASS', limit: 100, includeRaw: false },
  { key: 'subclasses', type: 'SUBCLASS', limit: 100, includeRaw: false },
  { key: 'races', type: 'RACE', limit: 100, includeRaw: false },
  { key: 'backgrounds', type: 'BACKGROUND', limit: 100, includeRaw: false },
  { key: 'feats', type: 'FEAT', limit: 200, includeRaw: false },
  { key: 'items', type: 'ITEM', limit: 10000, includeRaw: false },
  { key: 'rulesets', type: 'RULESET', limit: 100, includeRaw: false },
  { key: 'rules', type: 'RULE', limit: 500, includeRaw: false },
];

export interface BrowseLibrary {
  classes: RuleItemResponse[];
  subclasses: RuleItemResponse[];
  races: RuleItemResponse[];
  backgrounds: RuleItemResponse[];
  feats: RuleItemResponse[];
  items: RuleItemResponse[];
  rulesets: RuleItemResponse[];
  rules: RuleItemResponse[];
  spells: RuleItemResponse[];
  isLoading: boolean;
}

/** Full pack catalog for the public library, one lean batch + the shared spell catalog. */
export const useBrowseLibrary = (packId: string | null | undefined): BrowseLibrary => {
  const { data: batch, isLoading: batchLoading } = useQuery({
    queryKey: ['rule-items', packId, 'browse-batch'],
    enabled: !!packId,
    staleTime: Infinity,
    queryFn: () =>
      ruleItemsApi.getBatch({
        packId: packId as string,
        queries: [...BROWSE_BATCH_QUERIES],
      }),
  });

  const { allSpells, allSpellsLoading } = useAllSpells(packId);

  return {
    classes: batch?.classes?.items ?? EMPTY_ITEMS,
    subclasses: batch?.subclasses?.items ?? EMPTY_ITEMS,
    races: batch?.races?.items ?? EMPTY_ITEMS,
    backgrounds: batch?.backgrounds?.items ?? EMPTY_ITEMS,
    feats: batch?.feats?.items ?? EMPTY_ITEMS,
    items: batch?.items?.items ?? EMPTY_ITEMS,
    rulesets: batch?.rulesets?.items ?? EMPTY_ITEMS,
    rules: batch?.rules?.items ?? EMPTY_ITEMS,
    spells: allSpells,
    isLoading: batchLoading || allSpellsLoading,
  };
};
