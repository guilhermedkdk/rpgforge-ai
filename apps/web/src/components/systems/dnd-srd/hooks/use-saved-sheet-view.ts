'use client';

import { useCallback, useMemo } from 'react';
import {
  buildEquipmentItemIdLookupMap,
  buildEquipmentRestorePatch,
  type CharacterFormData,
  type PackResponse,
  type RuleItemResponse,
} from '@rpgforce-ai/shared';
import { useRuleLibrary } from '../library/use-rule-library';
import { SAVED_SHEET_LIBRARY_KEYS } from '../library/library-config';
import { useAllSpells } from '../character-sheet/sections/spellcasting/hooks/use-all-spells';
import { useCharacterFormState } from './use-character-form-state';
import { useSheetDerivation } from './use-sheet-derivation';

/** Everything sheet-specific comes preloaded with the sheet (`.../with-rules`). */
export interface SheetPreloadedRuleItems {
  byId: Record<string, RuleItemResponse>;
  abilities: RuleItemResponse[];
  languages: RuleItemResponse[];
  toolItems?: RuleItemResponse[];
}

const TOOL_CATEGORY_TAG_KEYS = [
  'item:category:gaming-set',
  'item:category:musical-instrument',
  'item:category:artisan',
  'item:category:tools',
] as const;

interface UseSavedSheetViewParams {
  pack: PackResponse;
  initialData: CharacterFormData;
  preloadedRuleItems: SheetPreloadedRuleItems;
}

/**
 * Mounts a PERSISTED sheet: form state, the rule catalogs it renders from, and the derivation that
 * turns the stored data into what the sheet displays.
 *
 * One hook because there are two consumers of the same sheet — the owner's editable page and the
 * published read-only page — and a second copy of this wiring is how the two would start disagreeing
 * on the numbers they show for the very same character.
 */
export const useSavedSheetView = ({
  pack,
  initialData,
  preloadedRuleItems,
}: UseSavedSheetViewParams) => {
  // Rebuilds the equipment text synchronously so items show on first render (the derivation effect
  // runs too late for that, and `byId` already carries every referenced item).
  const hydrate = () => {
    const patch = buildEquipmentRestorePatch(
      initialData,
      (id) => preloadedRuleItems.byId[id]?.name,
      { gold: initialData.equipmentGold ?? 0, preserveSelectionIndexes: true }
    );
    return patch ? { ...initialData, ...patch } : initialData;
  };

  const { data, setData, featsRef, recalc, handleChange } = useCharacterFormState(hydrate, 'play');

  const library = useRuleLibrary(pack.id, SAVED_SHEET_LIBRARY_KEYS);
  // Everything the sheet DERIVES from a catalog (the equipped armor's AC, the weapons in Attacks,
  // the equipment names) needs those lists in hand. The PDF export waits on this flag.
  const catalogsLoaded = Object.values(library.loading).every((isLoading) => !isLoading);
  const { armors, allItems, classes: packClasses, subclasses: packSubclasses } = library.lists;
  const { weapons, adventuringGear } = library;

  const preloadedValues = useMemo(
    () => Object.values(preloadedRuleItems.byId),
    [preloadedRuleItems.byId]
  );
  const feats = useMemo(() => preloadedValues.filter((i) => i.kind === 'FEAT'), [preloadedValues]);
  featsRef.current = feats;

  // The preload carries every class/subclass the sheet references, so a multiclass sheet resolves
  // all of them; the pack list is the fallback for a class added during this session.
  const resolveRuleItem = useCallback(
    (id: string | null | undefined) =>
      id ? (preloadedRuleItems.byId[id] ?? packClasses.find((c) => c.id === id) ?? null) : null,
    [preloadedRuleItems.byId, packClasses]
  );

  const identity = useMemo(
    () => ({
      classItem: preloadedRuleItems.byId[data.classRuleItemId ?? ''] ?? null,
      subclassItem: preloadedRuleItems.byId[data.subclassRuleItemId ?? ''] ?? null,
      raceItem: preloadedRuleItems.byId[data.raceRuleItemId ?? ''] ?? null,
      bgItem: preloadedRuleItems.byId[data.backgroundRuleItemId ?? ''] ?? null,
      resolveRuleItem,
    }),
    [
      preloadedRuleItems.byId,
      data.classRuleItemId,
      data.subclassRuleItemId,
      data.raceRuleItemId,
      data.backgroundRuleItemId,
      resolveRuleItem,
    ]
  );

  // Species/background are locked, so the only ones the sheet can need are its own. Classes and
  // subclasses come from the pack instead: a sheet that reaches level 3 without a subclass still has
  // to pick it, the save validation reads the pack's list to know whether the class has one at all,
  // and multiclassing needs the full list to add a class.
  const classes = packClasses;
  const subclasses = packSubclasses;
  const races = useMemo(() => (identity.raceItem ? [identity.raceItem] : []), [identity.raceItem]);
  const backgrounds = useMemo(() => (identity.bgItem ? [identity.bgItem] : []), [identity.bgItem]);

  const toolItemsByCategory = useMemo(() => {
    // Prefers the dedicated toolItems list; falls back to scanning preloadedValues for referenced tools.
    const allTools =
      preloadedRuleItems.toolItems ??
      preloadedValues.filter((i) =>
        i.tagKeys.some((t) => (TOOL_CATEGORY_TAG_KEYS as readonly string[]).includes(t))
      );
    return Object.fromEntries(
      TOOL_CATEGORY_TAG_KEYS.map((tag) => [tag, allTools.filter((i) => i.tagKeys.includes(tag))])
    );
  }, [preloadedRuleItems.toolItems, preloadedValues]);

  const standardLanguageOptions = useMemo(
    () =>
      [...preloadedRuleItems.languages].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
      ),
    [preloadedRuleItems.languages]
  );

  // Preloaded items + the whole ITEM catalog (fetched for the gear picker anyway), so anything bought
  // during play still resolves to an id on save.
  const equipmentItems = useMemo(
    () => [...preloadedValues, ...allItems, ...weapons],
    [preloadedValues, allItems, weapons]
  );
  const itemById = useMemo(() => {
    const m = new Map<string, RuleItemResponse>();
    for (const it of equipmentItems) if (it?.id) m.set(it.id, it);
    return m;
  }, [equipmentItems]);
  const itemIdByLookupKey = useMemo(
    () => buildEquipmentItemIdLookupMap(equipmentItems),
    [equipmentItems]
  );

  const { allSpells } = useAllSpells(
    identity.classItem?.packId ?? identity.raceItem?.packId ?? pack.id
  );

  const { requestRederive } = useSheetDerivation({
    data,
    setData,
    recalc,
    identity,
    abilities: preloadedRuleItems.abilities,
    feats,
    toolItemsByCategory,
    standardLanguages: standardLanguageOptions,
    itemById,
    itemsLoading: library.loading.allItems,
  });

  // The catalog props `CharacterSheet` takes, bundled so both pages pass the identical set.
  const sheetCatalogProps = {
    classes,
    subclasses,
    backgrounds,
    races,
    abilities: preloadedRuleItems.abilities,
    weapons,
    armors,
    adventuringGear,
    feats,
    toolItemsByCategory,
    standardLanguageOptions,
    classesLoading: false,
    subclassesLoading: library.loading.subclasses,
    backgroundsLoading: false,
    racesLoading: false,
    abilitiesLoading: false,
    equipmentItemsLoading: library.loading.weapons || library.loading.armors,
  };

  return {
    data,
    setData,
    recalc,
    handleChange,
    featsRef,
    requestRederive,
    catalogsLoaded,
    sheetCatalogProps,
    // Needed by the save flow, which only the owner's page runs.
    feats,
    classes,
    subclasses,
    standardLanguageOptions,
    toolItemsByCategory,
    allSpells,
    itemIdByLookupKey,
  };
};
