'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ruleItemsApi } from '@/lib/api/rule-items';
import type { RuleItemBatchQuery, RuleItemResponse } from '@rpgforce-ai/shared';
import {
  ADVENTURING_GEAR_GROUP_KEYS,
  EDITOR_LIBRARY_KEYS,
  RULE_LIBRARY_QUERIES,
  type RuleLibraryKey,
} from './library-config';

const EMPTY_ITEMS: RuleItemResponse[] = [];
const ALL_ITEMS_KEY: RuleLibraryKey = 'allItems';

const matchesAllTags = (item: RuleItemResponse, tags: readonly string[]): boolean =>
  tags.every((t) => item.tagKeys.includes(t));

interface RuleLibrary {
  lists: Record<RuleLibraryKey, RuleItemResponse[]>;
  loading: Record<RuleLibraryKey, boolean>;
  /** Weapons including the Unarmed Strike base attack when available. */
  weapons: RuleItemResponse[];
  /** Merged gear picker list (gear, packs, scrolls, allowed potions, ammo, focuses). */
  adventuringGear: RuleItemResponse[];
  /** Tool catalogs keyed by their `item:category:*` tag. */
  toolItemsByCategory: Record<string, RuleItemResponse[]>;
  /** Standard languages sorted by name. */
  standardLanguages: RuleItemResponse[];
}

export const useRuleLibrary = (
  packId: string | null | undefined,
  keys: readonly RuleLibraryKey[] = EDITOR_LIBRARY_KEYS,
): RuleLibrary => {
  const requestedKeys = useMemo(() => new Set(keys), [keys]);

  // Derived lists need the ITEM catalog even when `allItems` isn't itself requested.
  const needsAllItems = useMemo(
    () =>
      requestedKeys.has(ALL_ITEMS_KEY) ||
      RULE_LIBRARY_QUERIES.some((q) => q.itemTags != null && requestedKeys.has(q.key)),
    [requestedKeys],
  );

  const fetchConfigs = useMemo(
    () =>
      RULE_LIBRARY_QUERIES.filter(
        (q) =>
          q.itemTags == null &&
          (requestedKeys.has(q.key) || (q.key === ALL_ITEMS_KEY && needsAllItems)),
      ),
    [requestedKeys, needsAllItems],
  );

  const fetchKeysKey = fetchConfigs.map((c) => c.key).join(',');

  const { data: batch, isLoading } = useQuery({
    queryKey: ['rule-items', packId, 'library-batch', fetchKeysKey],
    enabled: !!packId && fetchConfigs.length > 0,
    queryFn: () =>
      ruleItemsApi.getBatch({
        packId: packId as string,
        queries: fetchConfigs.map(
          (c): RuleItemBatchQuery => ({
            key: c.key,
            type: c.params?.type,
            q: c.params?.q,
            tag: c.params?.tags ?? c.params?.tag,
            level: c.params?.level,
            class: c.params?.class,
            limit: c.params?.limit,
            includeRaw: c.includeRaw,
          }),
        ),
      }),
  });

  const { lists, loading } = useMemo(() => {
    const lists = {} as Record<RuleLibraryKey, RuleItemResponse[]>;
    const loading = {} as Record<RuleLibraryKey, boolean>;
    for (const { key } of RULE_LIBRARY_QUERIES) {
      lists[key] = EMPTY_ITEMS;
      loading[key] = false;
    }

    const allItems = batch?.[ALL_ITEMS_KEY]?.items ?? EMPTY_ITEMS;

    // Fetched lists come straight from the batch; ITEM sub-catalogs are sliced from `allItems`.
    for (const config of RULE_LIBRARY_QUERIES) {
      const requested = requestedKeys.has(config.key) || (config.key === ALL_ITEMS_KEY && needsAllItems);
      if (!requested) continue;
      loading[config.key] = isLoading;
      if (config.itemTags == null) {
        const items = config.postFilter
          ? config.postFilter(batch?.[config.key]?.items ?? EMPTY_ITEMS)
          : (batch?.[config.key]?.items ?? EMPTY_ITEMS);
        lists[config.key] = items;
      } else {
        const sliced = allItems.filter((it) => matchesAllTags(it, config.itemTags as string[]));
        lists[config.key] = config.postFilter ? config.postFilter(sliced) : sliced;
      }
    }

    return { lists, loading };
  }, [batch, isLoading, requestedKeys, needsAllItems]);

  const weapons = useMemo(() => {
    const unarmed = lists.unarmedStrike[0];
    return unarmed ? [...lists.weapons, unarmed] : lists.weapons;
  }, [lists.weapons, lists.unarmedStrike]);

  const adventuringGear = useMemo(() => {
    const seen = new Set<string>();
    const merged: RuleItemResponse[] = [];
    for (const key of ADVENTURING_GEAR_GROUP_KEYS) {
      for (const item of lists[key]) {
        if (seen.has(item.id)) continue;
        seen.add(item.id);
        merged.push(item);
      }
    }
    return merged;
  }, [lists]);

  const toolItemsByCategory = useMemo(
    () => ({
      'item:category:gaming-set': lists.gamingSets,
      'item:category:musical-instrument': lists.musicalInstruments,
      'item:category:artisan': lists.artisanTools,
      'item:category:tools': lists.tools,
    }),
    [lists],
  );

  const standardLanguages = useMemo(
    () =>
      [...lists.standardLanguages].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
      ),
    [lists.standardLanguages],
  );

  return { lists, loading, weapons, adventuringGear, toolItemsByCategory, standardLanguages };
};
