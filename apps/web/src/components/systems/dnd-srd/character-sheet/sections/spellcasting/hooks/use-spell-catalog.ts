'use client';

import * as React from 'react';
import { ruleItemsApi } from '@/lib/api/rule-items';
import {
  ruleItemSpellLevel,
  spellClassTag,
  spellNameToKebabSlug,
  type CharacterFormData,
  type RuleItemResponse,
} from '@rpgforce-ai/shared';
import { useAllSpells } from './use-all-spells';

const EMPTY_SPELLS: RuleItemResponse[] = [];

/** Cleric / Druid / Wizard: only leveled spells (1–9) merge with Bard; cantrips stay Bard-only. */
const MAGICAL_SECRETS_EXTRA_SPELL_CLASSES = ['Cleric', 'Druid', 'Wizard'] as const;

/** Full Bard list + level 1+ spells from Cleric/Druid/Wizard (by name; Bard wins on duplicates). */
function mergeMagicalSecretsClassSpells(
  bardItems: RuleItemResponse[],
  extraItems: RuleItemResponse[]
): RuleItemResponse[] {
  const byName = new Map<string, RuleItemResponse>();
  for (const s of bardItems) {
    byName.set(s.name.trim().toLowerCase(), s);
  }
  for (const s of extraItems) {
    if (ruleItemSpellLevel(s) < 1) continue;
    const k = s.name.trim().toLowerCase();
    if (!byName.has(k)) byName.set(k, s);
  }
  return Array.from(byName.values());
}

interface UseSpellCatalogArgs {
  data: CharacterFormData;
  classes: RuleItemResponse[];
  races: RuleItemResponse[];
  /** Bard with Magical Secrets: merge extra class lists into the class spell list. */
  mergeMagicalSecrets: boolean;
  /** Every class the character casts with; each contributes its OWN spell list. */
  castingClassIds: string[];
}

/**
 * Loads the spell catalogs used by the spellcasting section:
 * the selected class list, the bulk pack list, and on-demand single-spell details
 * for race/off-list spells not present in either.
 */
export function useSpellCatalog({
  data,
  classes,
  races,
  mergeMagicalSecrets,
  castingClassIds,
}: UseSpellCatalogArgs) {
  const spellPackId = React.useMemo(() => {
    const classItem = classes.find((c) => c.id === data.classRuleItemId);
    if (classItem?.packId) return classItem.packId;
    const raceItem = races.find((r) => r.id === data.raceRuleItemId);
    return raceItem?.packId ?? null;
  }, [data.classRuleItemId, data.raceRuleItemId, classes, races]);

  // Full catalog shared via React Query (one request across the whole sheet); per-class lists are
  // sliced from it by `spell:class:*` tag.
  const { allSpells: packSpells, allSpellsLoading: packSpellsLoading } = useAllSpells(spellPackId);

  // Joined, not the array: the caller rebuilds it whenever the sheet changes, and re-slicing the
  // whole catalog on every keystroke is exactly the lag this sheet has been tuned away from.
  const castingClassIdsKey = castingClassIds.join('|');

  /** Each casting class's own list, sliced from the full catalog by class tag (no own request). */
  const classSpellsByClass = React.useMemo((): Record<string, RuleItemResponse[]> => {
    const out: Record<string, RuleItemResponse[]> = {};
    // The initial class is the fallback when no class casts yet, so the picker still has a list
    // while the derivation settles.
    const ids = castingClassIdsKey ? castingClassIdsKey.split('|') : [data.classRuleItemId ?? ''];
    for (const id of ids) {
      const classItem = classes.find((c) => c.id === id);
      if (!classItem) continue;
      const own = packSpells.filter((s) => s.tagKeys.includes(spellClassTag(classItem.name)));
      // Magical Secrets widens the BARD's list only; a Bard/Wizard's Wizard list stays its own.
      if (!mergeMagicalSecrets || classItem.name.trim().toLowerCase() !== 'bard') {
        out[id] = own;
        continue;
      }
      const extra = packSpells.filter((s) =>
        MAGICAL_SECRETS_EXTRA_SPELL_CLASSES.some((cn) => s.tagKeys.includes(spellClassTag(cn)))
      );
      out[id] = mergeMagicalSecretsClassSpells(own, extra);
    }
    return out;
  }, [packSpells, castingClassIdsKey, data.classRuleItemId, classes, mergeMagicalSecrets]);

  /** Union of every casting class's list: the pool "is this spell castable at all" reads. */
  const classSpells = React.useMemo(() => {
    const lists = Object.values(classSpellsByClass);
    if (lists.length === 0) return EMPTY_SPELLS;
    if (lists.length === 1) return lists[0];
    const byName = new Map<string, RuleItemResponse>();
    for (const list of lists) {
      for (const s of list) {
        const k = s.name.trim().toLowerCase();
        if (!byName.has(k)) byName.set(k, s);
      }
    }
    return Array.from(byName.values());
  }, [classSpellsByClass]);
  const spellsLoading = packSpellsLoading;

  /** Pack spells + class list (class fills gaps if API caps pack list size). */
  const spellByNameLower = React.useMemo(() => {
    const m = new Map<string, RuleItemResponse>();
    for (const s of packSpells) {
      m.set(s.name.trim().toLowerCase(), s);
    }
    for (const s of classSpells) {
      const k = s.name.trim().toLowerCase();
      if (!m.has(k)) m.set(k, s);
    }
    return m;
  }, [packSpells, classSpells]);

  const lookupSpellByParsedName = React.useCallback(
    (trimmed: string): RuleItemResponse | null => {
      const plain = trimmed.replace(/\*\*/g, '').split('\n')[0]?.trim() ?? trimmed;
      const key = plain.toLowerCase();
      const direct = spellByNameLower.get(key);
      if (direct) return direct;
      // Table cell sometimes has extra prose; try first segment before "." or " ("
      const short = plain.split(/[.(]/)[0]?.trim().toLowerCase() ?? key;
      if (short !== key) {
        const hit = spellByNameLower.get(short);
        if (hit) return hit;
      }
      return null;
    },
    [spellByNameLower]
  );

  /** Spells fetched by slug/search — covers race/off-list spells not in class list or bulk pack slice. */
  const [spellDetailsExtra, setSpellDetailsExtra] = React.useState<
    Record<string, RuleItemResponse>
  >({});
  const spellDetailsExtraRef = React.useRef(spellDetailsExtra);
  spellDetailsExtraRef.current = spellDetailsExtra;

  const [onDemandSpellLoading, setOnDemandSpellLoading] = React.useState<Record<string, boolean>>(
    {}
  );
  const [onDemandSpellFailed, setOnDemandSpellFailed] = React.useState<Record<string, boolean>>({});
  const spellDetailInFlightRef = React.useRef<Set<string>>(new Set());
  const spellDetailFailedRef = React.useRef<Set<string>>(new Set());

  React.useEffect(() => {
    setSpellDetailsExtra({});
    setOnDemandSpellFailed({});
    spellDetailFailedRef.current.clear();
    spellDetailInFlightRef.current.clear();
  }, [spellPackId]);

  const resolveSpellRule = React.useCallback(
    (name: string) => {
      const k = name.trim().toLowerCase();
      return (
        packSpells.find((s) => s.name.trim().toLowerCase() === k) ??
        classSpells.find((s) => s.name.trim().toLowerCase() === k) ??
        spellDetailsExtra[k] ??
        null
      );
    },
    [packSpells, classSpells, spellDetailsExtra]
  );

  const fetchSpellDetailsOnDemand = React.useCallback(
    (displayName: string) => {
      const k = displayName.trim().toLowerCase();
      if (!spellPackId || !k) return;
      if (
        packSpells.some((s) => s.name.trim().toLowerCase() === k) ||
        classSpells.some((s) => s.name.trim().toLowerCase() === k) ||
        spellDetailsExtraRef.current[k]
      ) {
        return;
      }
      if (spellDetailFailedRef.current.has(k) || spellDetailInFlightRef.current.has(k)) return;

      spellDetailInFlightRef.current.add(k);
      setOnDemandSpellLoading((prev) => ({ ...prev, [k]: true }));

      void (async () => {
        try {
          let item: RuleItemResponse | null = null;
          const slug = spellNameToKebabSlug(displayName);
          if (slug.length >= 2) {
            try {
              item = await ruleItemsApi.getByIdOrSlug(slug, spellPackId);
            } catch {
              item = null;
            }
          }
          if (!item) {
            const list = await ruleItemsApi.getList({
              type: 'SPELL',
              packId: spellPackId,
              q: displayName.trim(),
              limit: 120,
            });
            item = list.items.find((s) => s.name.trim().toLowerCase() === k) ?? null;
          }
          if (item) {
            setSpellDetailsExtra((prev) => ({ ...prev, [k]: item! }));
            setOnDemandSpellFailed((prev) => {
              if (!prev[k]) return prev;
              const next = { ...prev };
              delete next[k];
              return next;
            });
          } else {
            spellDetailFailedRef.current.add(k);
            setOnDemandSpellFailed((prev) => ({ ...prev, [k]: true }));
          }
        } catch {
          spellDetailFailedRef.current.add(k);
          setOnDemandSpellFailed((prev) => ({ ...prev, [k]: true }));
        } finally {
          spellDetailInFlightRef.current.delete(k);
          setOnDemandSpellLoading((prev) => {
            if (!prev[k]) return prev;
            const next = { ...prev };
            delete next[k];
            return next;
          });
        }
      })();
    },
    [spellPackId, packSpells, classSpells]
  );

  return {
    spellPackId,
    classSpells,
    classSpellsByClass,
    spellsLoading,
    packSpells,
    packSpellsLoading,
    spellByNameLower,
    lookupSpellByParsedName,
    resolveSpellRule,
    fetchSpellDetailsOnDemand,
    onDemandSpellLoading,
    onDemandSpellFailed,
  };
}
