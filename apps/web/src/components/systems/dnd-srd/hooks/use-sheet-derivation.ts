'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  applyDerivedToCharacterData,
  buildEquipmentRestorePatch,
  getDerivedFromRuleItems,
  getSkillsFromAbilities,
  normalizeStandardLanguageNames,
  seedToolProficiencyChoicesFromPersisted,
  syncClassMirrors,
  SUBCLASS_UNLOCK_LEVEL,
  type CharacterFormData,
  type RuleItemResponse,
} from '@rpgforce-ai/shared';

/** The sheet's identity rule items. A field is null while its id hasn't resolved from the API yet. */
export interface SheetIdentityRuleItems {
  /** The INITIAL class (mirrors `data.classes[0]`); the whole list resolves via `resolveRuleItem`. */
  classItem: RuleItemResponse | null;
  subclassItem: RuleItemResponse | null;
  raceItem: RuleItemResponse | null;
  bgItem: RuleItemResponse | null;
  /** Resolves any class/subclass id, so a multiclass sheet derives every class, not just the first. */
  resolveRuleItem: (id: string | null | undefined) => RuleItemResponse | null;
}

interface UseSheetDerivationArgs {
  data: CharacterFormData;
  /** Unfiltered setter; used by the effects that must not go through combat recompute. */
  setData: (updater: (prev: CharacterFormData) => CharacterFormData) => void;
  /** setData + combat recompute (from useCharacterFormState). */
  recalc: (updater: (prev: CharacterFormData) => CharacterFormData) => void;
  identity: SheetIdentityRuleItems;
  abilities: RuleItemResponse[];
  feats: RuleItemResponse[];
  toolItemsByCategory: Record<string, RuleItemResponse[]>;
  standardLanguages: RuleItemResponse[];
  /** Catalog for rebuilding the equipment text from persisted `{ id, quantity }` rows. */
  itemById: Map<string, RuleItemResponse>;
  itemsLoading: boolean;
}

/**
 * Keeps the form in sync with the pack: display names, the rule derivation (features, proficiencies,
 * choice menus, combat), the persisted→slots restores. Shared by the creation editor and the saved
 * sheet, so a level-up on a saved character runs the SAME derivation a fresh build does.
 */
export function useSheetDerivation({
  data,
  setData,
  recalc,
  identity,
  abilities,
  feats,
  toolItemsByCategory,
  standardLanguages,
  itemById,
  itemsLoading,
}: UseSheetDerivationArgs) {
  const { classItem, subclassItem, raceItem, bgItem, resolveRuleItem } = identity;

  // Every class the sheet has levels in, resolved to rule items. Entries whose class has not
  // resolved yet are dropped; the derivation effect below waits for all of them.
  const classEntries = useMemo(
    () =>
      (data.classes ?? [])
        .filter((entry) => Boolean(entry.classRuleItemId))
        .map((entry) => ({
          classItem: resolveRuleItem(entry.classRuleItemId),
          subclassItem: resolveRuleItem(entry.subclassRuleItemId),
          level: entry.level,
        })),
    [data.classes, resolveRuleItem]
  );
  const classEntriesKey = classEntries
    .map((e) => `${e.classItem?.id ?? '-'}/${e.subclassItem?.id ?? '-'}/${e.level}`)
    .join('|');
  const classEntriesResolved = classEntries.every((e) => e.classItem != null);

  const allSkillOptions = useMemo(
    () => getSkillsFromAbilities(abilities).map((s) => ({ key: s.key, label: s.name })),
    [abilities]
  );
  const skillOptsKey = allSkillOptions
    .map((o) => o.key)
    .sort()
    .join(',');

  useEffect(() => {
    if (standardLanguages.length === 0) return;
    recalc((prev) => {
      const next = normalizeStandardLanguageNames(
        prev.standardLanguageNames ?? ['Common'],
        standardLanguages
      );
      const p = prev.standardLanguageNames ?? [];
      if (next.length === p.length && next.every((v, i) => v === p[i])) return prev;
      return { ...prev, standardLanguageNames: next };
    });
  }, [standardLanguages, recalc]);

  // Persistence uses only *RuleItemId; display names come from the pack (source of truth in the DB).
  useEffect(() => {
    recalc((prev) => {
      const patch: Partial<CharacterFormData> = {};
      const sync = (
        key: 'className' | 'subclass' | 'race' | 'background',
        item: RuleItemResponse | null
      ) => {
        const name = item?.name?.trim() ?? '';
        if (name && prev[key] !== name) patch[key] = name;
      };
      if (prev.classRuleItemId) sync('className', classItem);
      if (prev.subclassRuleItemId) sync('subclass', subclassItem);
      if (prev.raceRuleItemId) sync('race', raceItem);
      if (prev.backgroundRuleItemId) sync('background', bgItem);

      // Same for every class entry: names are display-only, ids are the persisted truth.
      let classesChanged = false;
      const classes = (prev.classes ?? []).map((entry) => {
        if (!entry.classRuleItemId) return entry;
        const resolvedClass = resolveRuleItem(entry.classRuleItemId);
        const resolvedSubclass = resolveRuleItem(entry.subclassRuleItemId);
        const className = resolvedClass?.name?.trim() ?? entry.className;
        const subclass = entry.subclassRuleItemId
          ? (resolvedSubclass?.name?.trim() ?? entry.subclass)
          : '';
        if (className === entry.className && subclass === entry.subclass) return entry;
        classesChanged = true;
        return { ...entry, className, subclass };
      });

      if (Object.keys(patch).length === 0 && !classesChanged) return prev;
      return syncClassMirrors({ ...prev, ...patch, ...(classesChanged ? { classes } : {}) });
    });
  }, [
    classItem,
    subclassItem,
    raceItem,
    bgItem,
    resolveRuleItem,
    classEntriesKey,
    data.classRuleItemId,
    data.subclassRuleItemId,
    data.raceRuleItemId,
    data.backgroundRuleItemId,
    recalc,
  ]);

  // Rebuild `data.equipment` from `{ equipment: { gold, items } }` once catalog names resolve for ids.
  useEffect(() => {
    const entries = data.equipmentPersistedItems ?? [];
    const needsCatalog = entries.some((e) => e.id);
    if (needsCatalog && itemsLoading) return;
    recalc((prev) => {
      // preserveSelectionIndexes: the bundle choice is already committed in the persisted sheet;
      // clearing it here reads back as "nothing chosen" and blocks the next save.
      const patch = buildEquipmentRestorePatch(prev, (id) => itemById.get(id)?.name, {
        gold: prev.equipmentGold ?? 0,
        goldBySource: prev.equipmentGoldBySource,
        preserveSelectionIndexes: true,
      });
      return patch ? { ...prev, ...patch } : prev;
    });
  }, [
    data.equipment,
    data.equipmentGold,
    data.equipmentPersistedItems,
    data.equipmentSpentGP,
    data.purchasedEquipment,
    itemsLoading,
    itemById,
    recalc,
  ]);

  // A subclass only exists from level 3 IN ITS OWN CLASS: dropping that class below 3 discards it.
  // Checked per entry, so a Fighter 5 / Wizard 1 keeps the Fighter subclass and has no Wizard one.
  useEffect(() => {
    const needsClear = (data.classes ?? []).some(
      (entry) =>
        entry.level < SUBCLASS_UNLOCK_LEVEL &&
        (entry.subclassRuleItemId != null || Boolean(entry.subclass?.trim()))
    );
    if (!needsClear) return;
    recalc((prev) =>
      syncClassMirrors({
        ...prev,
        classes: (prev.classes ?? []).map((entry) =>
          entry.level < SUBCLASS_UNLOCK_LEVEL
            ? { ...entry, subclassRuleItemId: null, subclass: '' }
            : entry
        ),
      })
    );
  }, [data.classes, recalc]);

  const lastDerivedRef = useRef({
    classId: null as string | null,
    subclassId: null as string | null,
    raceId: null as string | null,
    bgId: null as string | null,
    level: 1,
    skillOptsKey: '',
    /** Changes when rule-item lists start resolving the ids (avoids an "empty" derive and a permanent skip). */
    ruleDataKey: '',
  });

  // Bumped by `requestRederive`, and a dep of the derivation effect: clearing the fingerprint alone is
  // not enough, because the effect only re-runs when one of its deps changes.
  const [rederiveNonce, setRederiveNonce] = useState(0);

  /**
   * Runs the derivation again even when identity/level did not change.
   *
   * Callers that RESET part of the sheet (a class/background swap wiping the old skill picks, a discard
   * restoring an older snapshot) must call this: their patch and the derivation are separate effects,
   * so whichever runs last would otherwise win. With this, the derivation always gets the final word
   * and re-applies what the new identity grants, no matter the effect order.
   */
  const requestRederive = useCallback(() => {
    lastDerivedRef.current = {
      classId: null,
      subclassId: null,
      raceId: null,
      bgId: null,
      level: -1,
      skillOptsKey: '',
      ruleDataKey: '',
    };
    setRederiveNonce((n) => n + 1);
  }, []);

  useEffect(() => {
    const { classRuleItemId, subclassRuleItemId, raceRuleItemId, backgroundRuleItemId, level } =
      data;
    // Nothing selected yet (empty editor, or the first render before an AI draft is applied): skip.
    // Deriving from an all-null character produces an "empty" derivation that, via setData's latest
    // state, would wipe the background ability bonus the just-applied draft supplied.
    if (classRuleItemId == null && raceRuleItemId == null && backgroundRuleItemId == null) return;

    // Do not derive until the referenced rule items resolved. Running with null class/race/bg items
    // yields incomplete featureDetails and clears persisted choices (fingerprint vs empty class
    // names, raceTraitSelections vs missing race features).
    if (classRuleItemId != null && classItem == null) return;
    if (subclassRuleItemId != null && subclassItem == null) return;
    if (raceRuleItemId != null && raceItem == null) return;
    if (backgroundRuleItemId != null && bgItem == null) return;
    // Same guard for the other classes of a multiclass sheet.
    if (!classEntriesResolved) return;

    const ruleDataKey = [
      classEntriesKey,
      raceItem?.id ?? '-',
      bgItem?.id ?? '-',
      feats.length,
      allSkillOptions.length,
    ].join(':');

    const prev = lastDerivedRef.current;
    if (
      prev.classId === (classRuleItemId ?? null) &&
      prev.subclassId === (subclassRuleItemId ?? null) &&
      prev.raceId === (raceRuleItemId ?? null) &&
      prev.bgId === (backgroundRuleItemId ?? null) &&
      prev.level === level &&
      prev.skillOptsKey === skillOptsKey &&
      prev.ruleDataKey === ruleDataKey
    ) {
      return;
    }

    // True only when swapping one class for another (not on initial load/first pick, where
    // prev.classId is null) — drives the source-aware class-feature reset in applyDerivedToCharacterData.
    const classChanged = prev.classId !== null && prev.classId !== (classRuleItemId ?? null);

    lastDerivedRef.current = {
      classId: classRuleItemId ?? null,
      subclassId: subclassRuleItemId ?? null,
      raceId: raceRuleItemId ?? null,
      bgId: backgroundRuleItemId ?? null,
      level,
      skillOptsKey,
      ruleDataKey,
    };
    const derived = getDerivedFromRuleItems({
      classes: classEntries.filter(
        (
          e
        ): e is {
          classItem: RuleItemResponse;
          subclassItem: RuleItemResponse | null;
          level: number;
        } => e.classItem != null
      ),
      raceItem,
      backgroundItem: bgItem,
      feats,
      allSkillOptions,
    });
    // Through `recalc`, so a level-up that grants an HP/AC feature (Draconic Resilience at 3) lands
    // its combat numbers in the same pass instead of waiting for the next unrelated edit.
    recalc((prevData) => applyDerivedToCharacterData(prevData, derived, feats, classChanged));
  }, [
    data.classRuleItemId,
    data.subclassRuleItemId,
    data.raceRuleItemId,
    data.backgroundRuleItemId,
    data.level,
    classItem,
    subclassItem,
    raceItem,
    bgItem,
    classEntries,
    classEntriesKey,
    classEntriesResolved,
    feats,
    allSkillOptions,
    skillOptsKey,
    rederiveNonce,
    recalc,
  ]);

  // Redistribute persisted tool picks into their "Choose…" slots once the tool catalog loads;
  // idempotent (clears the transient snapshot), so it settles after one pass and can't loop.
  useEffect(() => {
    setData((prev) => {
      const patch = seedToolProficiencyChoicesFromPersisted(prev, toolItemsByCategory);
      return patch ? { ...prev, ...patch } : prev;
    });
  }, [setData, toolItemsByCategory, data.persistedToolProficiencies, data.proficiencies]);

  return { allSkillOptions, requestRederive };
}
