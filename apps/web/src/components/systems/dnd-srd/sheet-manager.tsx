'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MoreHorizontal, RotateCcw, Trash2 } from 'lucide-react';
import { BackLink } from '@/components/ui/back-link';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DeleteSheetDialog } from '@/components/sheets/delete-sheet-dialog';
import {
  resolveSheetSaveState,
  SheetSaveStateChip,
  UnsavedChangesBar,
} from '@/components/sheets/sheet-save-state';
import {
  UnsavedChangesDialog,
  useUnsavedChangesGuard,
} from '@/components/sheets/unsaved-changes-guard';
import { CharacterSheet } from '@/components/systems/dnd-srd/character-sheet';
import {
  buildEquipmentItemIdLookupMap,
  buildEquipmentRestorePatch,
  type CharacterFormData,
  type PackResponse,
  type RuleItemResponse,
} from '@rpgforce-ai/shared';
import { useRuleLibrary } from './library/use-rule-library';
import { SAVED_SHEET_LIBRARY_KEYS } from './library/library-config';
import { useAllSpells } from './character-sheet/sections/spellcasting/hooks/use-all-spells';
import { useCharacterFormState } from './hooks/use-character-form-state';
import { useSheetDerivation } from './hooks/use-sheet-derivation';
import { useSheetSaveFlow } from './hooks/use-sheet-save-flow';

/** Everything sheet-specific comes preloaded with the sheet (`GET /character-sheets/:id/with-rules`). */
export interface SheetManagerPreloadedRuleItems {
  byId: Record<string, RuleItemResponse>;
  abilities: RuleItemResponse[];
  languages: RuleItemResponse[];
  toolItems?: RuleItemResponse[];
}

interface SheetManagerProps {
  sheetId: string;
  pack: PackResponse;
  initialData: CharacterFormData;
  preloadedRuleItems: SheetManagerPreloadedRuleItems;
  onBack: () => void;
}

const TOOL_CATEGORY_TAG_KEYS = [
  'item:category:gaming-set',
  'item:category:musical-instrument',
  'item:category:artisan',
  'item:category:tools',
] as const;

/**
 * A saved character: playable AND editable in place. Level, spells, features, combat, equipment and
 * personality are live; the creation allocations the sheet already committed render locked (see
 * `character-sheet/locks.ts`). It runs the SAME derivation and the SAME save validation the creation
 * editor runs, so leveling up here can't produce a sheet the creation flow would call invalid.
 */
export function SheetManager({
  sheetId,
  pack,
  initialData,
  preloadedRuleItems,
  onBack,
}: SheetManagerProps) {
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

  const router = useRouter();
  const { data, setData, featsRef, recalc, handleChange } = useCharacterFormState(hydrate, 'play');
  const [dirty, setDirty] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  // Snapshot for "Descartar alterações": tracks `data` while the sheet is clean, so it holds the
  // last saved state AFTER the derivation settled (reverting to the raw persisted shape would leave
  // the sheet underived, since the derivation only re-runs when its fingerprint changes).
  const savedDataRef = useRef<CharacterFormData>(data);
  if (!dirty) savedDataRef.current = data;

  // "Alterações não salvas" must mean the PLAYER changed something. Rule-driven writes share the same
  // onChange (granted spells, stale-pick reconciliations) and several of them fire while the sheet
  // loads, so state changes alone can't be the signal. A payload diff can't either: re-serializing an
  // untouched sheet legitimately differs in shape (key order, zero-filled ASI abilities, duplicate
  // item rows resolving to another id). So the flag is armed by the first real interaction — after
  // that, a derived write is always downstream of an edit anyway.
  const userInteractedRef = useRef(false);
  useEffect(() => {
    const arm = () => {
      userInteractedRef.current = true;
    };
    const opts = { capture: true, once: true } as const;
    document.addEventListener('pointerdown', arm, opts);
    document.addEventListener('keydown', arm, opts);
    return () => {
      document.removeEventListener('pointerdown', arm, opts);
      document.removeEventListener('keydown', arm, opts);
    };
  }, []);

  const onChange = useCallback(
    (next: CharacterFormData) => {
      if (userInteractedRef.current) setDirty(true);
      handleChange(next);
    },
    [handleChange]
  );

  const library = useRuleLibrary(pack.id, SAVED_SHEET_LIBRARY_KEYS);
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

  const { validateAndSave, saving, saved, saveError, saveErrorStatus, saveAttempted } =
    useSheetSaveFlow({
      data,
      mode: 'play',
      packId: pack.id,
      sheetId,
      abilities: preloadedRuleItems.abilities,
      feats,
      classes,
      subclasses,
      standardLanguages: standardLanguageOptions,
      toolItemsByCategory,
      allSpells,
      itemIdByLookupKey,
    });

  const handleSave = async () => {
    const id = await validateAndSave();
    if (id) setDirty(false);
  };

  // The open sheet was deleted server-side (PATCH → 404): persist the current state as a new sheet
  // instead of losing the work, then open it.
  const handleSaveAsNew = async () => {
    const id = await validateAndSave({ sheetId: null });
    if (id) router.push(`/sheets/${id}`);
  };

  const handleDiscard = () => {
    setDirty(false);
    // The restored snapshot may sit at a different level than the last derivation ran at, so ask for a
    // fresh pass instead of letting it skip as "already derived".
    requestRederive();
    setData(() => savedDataRef.current);
  };

  const guard = useUnsavedChangesGuard(dirty);

  return (
    <>
      {/* Everything animated lives here; the fixed bar below must stay OUT, or the transform makes
          this element its containing block and it lands at the bottom of the ~2000px sheet. */}
      <div className="content-reveal">
        <BackLink onClick={() => guard.guard(onBack)} className="mb-3">
          Minhas Fichas
        </BackLink>
        <div className="mb-6 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="truncate font-serif text-2xl font-bold text-foreground">
              {data.name?.trim() || 'Ficha sem nome'}
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Sistema: <span className="font-medium text-foreground">{pack.name}</span>
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <SheetSaveStateChip state={resolveSheetSaveState({ dirty, saving, saved })} />
            <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="ghost" size="icon" aria-label="Ações da ficha">
                  <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem disabled={!dirty || saving} onSelect={handleDiscard}>
                  <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
                  Descartar alterações
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={(e) => {
                    // Close the menu by hand instead of letting Radix do it on select: its focus
                    // restore would fight the dialog, and the menu would stay open behind it.
                    e.preventDefault();
                    setMenuOpen(false);
                    setDeleteOpen(true);
                  }}
                >
                  <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
                  Excluir ficha
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <CharacterSheet
          data={data}
          classes={classes}
          subclasses={subclasses}
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
          subclassesLoading={library.loading.subclasses}
          backgroundsLoading={false}
          racesLoading={false}
          abilitiesLoading={false}
          equipmentItemsLoading={library.loading.weapons || library.loading.armors}
          onChange={onChange}
          mode="play"
          saveAttempted={saveAttempted}
        />
      </div>

      {dirty ? (
        <UnsavedChangesBar
          saving={saving}
          onSave={() => void handleSave()}
          onDiscard={handleDiscard}
          footer={
            saveError ? (
              <div className="flex flex-col items-center gap-1.5 px-2 pb-1">
                <p className="max-w-xs text-center text-xs text-destructive">{saveError}</p>
                {saveErrorStatus === 404 ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={saving}
                    onClick={() => void handleSaveAsNew()}
                  >
                    Salvar como nova ficha
                  </Button>
                ) : null}
              </div>
            ) : null
          }
        />
      ) : null}

      <DeleteSheetDialog
        sheetId={sheetId}
        sheetName={data.name ?? ''}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onDeleted={onBack}
      />
      <UnsavedChangesDialog
        open={guard.isConfirming}
        onConfirm={guard.confirm}
        onCancel={guard.cancel}
      />
    </>
  );
}
