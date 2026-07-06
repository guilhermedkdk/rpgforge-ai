'use client';

import { useEffect, useRef, useMemo } from 'react';
import { Save, Check, Edit } from 'lucide-react';
import { BackLink } from '@/components/ui/back-link';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { CharacterSheet } from '@/components/systems/dnd-srd/character-sheet';
import {
  buildResolvedProficiencies,
  getSkillsFromAbilities,
  seedToolProficiencyChoicesFromPersisted,
} from '@/components/systems/dnd-srd/character-sheet/helpers';
import { type CharacterFormData } from '@/lib/dnd-srd/character-state';
import {
  getDerivedFromRuleItems,
  applyDerivedToCharacterData,
  applyCombatFromAttributes,
} from '@/lib/dnd-srd/derived-character-stats';
import { toPersistedCharacterPayload } from '@/lib/dnd-srd/character-persistence';
import { buildEquipmentItemIdLookupMap } from '@/lib/dnd-srd/equipment-utils';
import {
  resolveEquipmentPersistedItems,
  buildEquipmentRestorePatch,
} from '@/lib/dnd-srd/equipment-resolution';
import { useRuleLibrary } from './library/use-rule-library';
import { SESSION_LIBRARY_KEYS } from './library/library-config';
import { useCharacterFormState } from './hooks/use-character-form-state';
import { useSaveSheet } from './hooks/use-save-sheet';
import type { PackResponse, RuleItemResponse } from '@rpgforce-ai/shared';

export interface SessionPreloadedRuleItems {
  byId: Record<string, RuleItemResponse>;
  abilities: RuleItemResponse[];
  languages: RuleItemResponse[];
  toolItems?: RuleItemResponse[];
}

interface SheetSessionProps {
  sheetId: string;
  pack: PackResponse;
  initialData: CharacterFormData;
  preloadedRuleItems: SessionPreloadedRuleItems;
  onBack: () => void;
}

export function SheetSession({
  sheetId,
  pack,
  initialData,
  preloadedRuleItems,
  onBack,
}: SheetSessionProps) {
  // Rebuilds equipment synchronously so items show on first render (the mount effect below is too late).
  const { data, setData, featsRef, handleChange } = useCharacterFormState('session', () => {
    const patch = buildEquipmentRestorePatch(
      initialData,
      (id) => preloadedRuleItems.byId[id]?.name
    );
    return patch ? { ...initialData, ...patch } : initialData;
  });
  const { save, saving, saved, saveError } = useSaveSheet();

  const library = useRuleLibrary(pack.id, SESSION_LIBRARY_KEYS);
  const { armors } = library.lists;
  const { weapons, adventuringGear } = library;

  const derivedAppliedRef = useRef(false);
  featsRef.current = Object.values(preloadedRuleItems.byId).filter((i) => i.kind === 'FEAT');

  // Re-derives proficiencies/features/speed from the pack once on mount, without touching HP/equipment.
  useEffect(() => {
    if (derivedAppliedRef.current) return;
    derivedAppliedRef.current = true;

    const preloadedValues = Object.values(preloadedRuleItems.byId);
    const classItem = initialData.classRuleItemId
      ? (preloadedValues.find((i) => i.id === initialData.classRuleItemId) ?? null)
      : null;
    const raceItem = initialData.raceRuleItemId
      ? (preloadedValues.find((i) => i.id === initialData.raceRuleItemId) ?? null)
      : null;
    const bgItem = initialData.backgroundRuleItemId
      ? (preloadedValues.find((i) => i.id === initialData.backgroundRuleItemId) ?? null)
      : null;
    const feats = preloadedValues.filter((i) => i.kind === 'FEAT');
    const allSkillOptions = getSkillsFromAbilities(preloadedRuleItems.abilities).map((s) => ({
      key: s.key,
      label: s.name,
    }));

    const derived = getDerivedFromRuleItems(
      classItem,
      raceItem,
      bgItem,
      initialData.level,
      feats,
      allSkillOptions
    );

    setData((prev) => {
      const restorePatch = buildEquipmentRestorePatch(
        prev,
        (id) => preloadedRuleItems.byId[id]?.name
      );
      let base = restorePatch ? { ...prev, ...restorePatch } : prev;

      // Populate display-only name fields (not persisted in schema v1, derived from rule items).
      if (classItem?.name) base = { ...base, className: classItem.name };
      if (raceItem?.name) base = { ...base, race: raceItem.name };
      if (bgItem?.name) base = { ...base, background: bgItem.name };

      return applyCombatFromAttributes(applyDerivedToCharacterData(base, derived, feats), feats);
    });
  }, []);

  const preloadedValues = useMemo(
    () => Object.values(preloadedRuleItems.byId),
    [preloadedRuleItems.byId]
  );

  // Includes the fetched catalogs so items added during the session also resolve to ids on save.
  const itemIdByLookupKey = useMemo(
    () =>
      buildEquipmentItemIdLookupMap([
        ...preloadedValues,
        ...weapons,
        ...armors,
        ...adventuringGear,
      ]),
    [preloadedValues, weapons, armors, adventuringGear]
  );

  const handleSave = async () => {
    // Wallet coins come from data.walletGP/SP/CP in session mode, so gold is omitted here.
    const payload = toPersistedCharacterPayload(
      data,
      buildResolvedProficiencies(data, { toolItemsByCategory, standardLanguageOptions }),
      { items: resolveEquipmentPersistedItems(data, itemIdByLookupKey) }
    );
    await save({ sheetId, packId: pack.id, payload });
  };

  const classes = useMemo(
    () => preloadedValues.filter((i) => i.kind === 'CLASS'),
    [preloadedValues]
  );
  const races = useMemo(() => preloadedValues.filter((i) => i.kind === 'RACE'), [preloadedValues]);
  const backgrounds = useMemo(
    () => preloadedValues.filter((i) => i.kind === 'BACKGROUND'),
    [preloadedValues]
  );
  const feats = useMemo(() => preloadedValues.filter((i) => i.kind === 'FEAT'), [preloadedValues]);
  const toolItemsByCategory = useMemo(() => {
    // Prefers the dedicated toolItems list; falls back to scanning preloadedValues for referenced tools.
    const allTools =
      preloadedRuleItems.toolItems ??
      preloadedValues.filter((i) =>
        i.tagKeys.some(
          (t) =>
            t === 'item:category:gaming-set' ||
            t === 'item:category:musical-instrument' ||
            t === 'item:category:artisan' ||
            t === 'item:category:tools'
        )
      );
    return {
      'item:category:gaming-set': allTools.filter((i) =>
        i.tagKeys.includes('item:category:gaming-set')
      ),
      'item:category:musical-instrument': allTools.filter((i) =>
        i.tagKeys.includes('item:category:musical-instrument')
      ),
      'item:category:artisan': allTools.filter((i) => i.tagKeys.includes('item:category:artisan')),
      'item:category:tools': allTools.filter((i) => i.tagKeys.includes('item:category:tools')),
    };
  }, [preloadedRuleItems.toolItems, preloadedValues]);
  const standardLanguageOptions = useMemo(
    () =>
      [...preloadedRuleItems.languages].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
      ),
    [preloadedRuleItems.languages]
  );

  // Same as the editor, but bypasses the onChange field filter directly; idempotent, so it can't loop.
  useEffect(() => {
    setData((prev) => {
      const patch = seedToolProficiencyChoicesFromPersisted(prev, toolItemsByCategory);
      return patch ? { ...prev, ...patch } : prev;
    });
  }, [setData, toolItemsByCategory, data.persistedToolProficiencies, data.proficiencies]);

  const editHref = `/create?packId=${encodeURIComponent(pack.id)}&sheetId=${encodeURIComponent(sheetId)}`;

  return (
    <>
      <BackLink onClick={onBack} className="mb-3">
        Minhas Fichas
      </BackLink>
      <div className="mb-6 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="font-serif text-2xl font-bold text-foreground">
            {data.name?.trim() || 'Ficha sem nome'}
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Sistema: <span className="font-medium text-foreground">{pack.name}</span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" asChild>
            <a href={editHref}>
              <Edit className="mr-2 h-4 w-4" aria-hidden="true" />
              Editar Ficha
            </a>
          </Button>
          <div className="flex flex-col items-end gap-1">
            <Button
              type="button"
              disabled={saving}
              onClick={() => void handleSave()}
              aria-label={saving ? 'Salvando' : undefined}
            >
              {saved ? (
                <>
                  <Check className="mr-2 h-4 w-4" aria-hidden="true" />
                  Salvo!
                </>
              ) : saving ? (
                <Spinner size="sm" />
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" aria-hidden="true" />
                  Salvar
                </>
              )}
            </Button>
            {saveError && (
              <p className="max-w-xs text-right text-xs text-destructive">{saveError}</p>
            )}
          </div>
        </div>
      </div>

      <CharacterSheet
        data={data}
        classes={classes}
        backgrounds={backgrounds}
        races={races}
        abilities={preloadedRuleItems.abilities}
        weapons={weapons}
        armors={armors}
        adventuringGear={adventuringGear}
        feats={feats}
        toolItemsByCategory={toolItemsByCategory}
        standardLanguageOptions={standardLanguageOptions}
        classesLoading={false}
        backgroundsLoading={false}
        racesLoading={false}
        abilitiesLoading={false}
        equipmentItemsLoading={library.loading.weapons || library.loading.armors}
        onChange={handleChange}
        readOnly
      />
    </>
  );
}
