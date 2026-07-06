'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import { Save, Check } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { isAxiosError } from 'axios';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { LoadingState } from '@/components/ui/loading-state';
import { characterSheetsApi } from '@/lib/api/character-sheets';
import {
  mergeCharacterFormDataFromApi,
  type CharacterFormData,
} from '@/lib/dnd-srd/character-state';
import {
  getDerivedFromRuleItems,
  applyDerivedToCharacterData,
} from '@/lib/dnd-srd/derived-character-stats';
import { CharacterSheet } from '@/components/systems/dnd-srd/character-sheet';
import {
  buildResolvedProficiencies,
  getSkillsFromAbilities,
  normalizeStandardLanguageNames,
  seedToolProficiencyChoicesFromPersisted,
} from '@/components/systems/dnd-srd/character-sheet/helpers';
import { getCharacterSheetSaveValidationErrors } from '@/lib/dnd-srd/character-sheet-save-validation';
import { toPersistedCharacterPayload } from '@/lib/dnd-srd/character-persistence';
import { buildEquipmentItemIdLookupMap, getAvailableGP } from '@/lib/dnd-srd/equipment-utils';
import { resolveEquipmentPersistedItems, buildEquipmentRestorePatch } from '@/lib/dnd-srd/equipment-resolution';
import { useRuleLibrary } from './library/use-rule-library';
import { useCharacterFormState } from './hooks/use-character-form-state';
import { useSaveSheet } from './hooks/use-save-sheet';
import type { PackResponse, RuleItemResponse } from '@rpgforce-ai/shared';

interface SheetEditorProps {
  pack: PackResponse;
  /** Required by the system registry contract; the editor itself has no back UI. */
  onBack: () => void;
  /** When set (e.g. from `?sheetId=` URL), load that sheet after mount. */
  initialSheetId?: string | null;
}

const SKILL_GRANTING_RACE_TRAIT_NAMES = new Set(['skillful', 'keen senses']);

/** Builds a patch that clears all user-chosen skill proficiency selections. */
function buildSkillChoicesResetPatch(
  prev: CharacterFormData,
  opts: { includeClassSkills: boolean; includeBackgroundSkills?: boolean },
): Partial<CharacterFormData> {
  const newSkillProficiencies = { ...prev.skillProficiencies };

  if (opts.includeClassSkills) {
    for (const k of prev.classSkillProficiencyKeys ?? []) {
      newSkillProficiencies[k] = false;
    }
  }

  // Clear old background skill contributions so derivation rebuilds cleanly from the new background.
  if (opts.includeBackgroundSkills) {
    for (const k of prev.backgroundSkillKeys ?? []) {
      newSkillProficiencies[k] = false;
    }
  }

  const newRaceTraitSelections = { ...(prev.raceTraitSelections ?? {}) };
  for (const [traitName, sel] of Object.entries(newRaceTraitSelections)) {
    if (SKILL_GRANTING_RACE_TRAIT_NAMES.has(traitName.trim().toLowerCase())) {
      if (sel) newSkillProficiencies[sel] = false;
      delete newRaceTraitSelections[traitName];
    }
  }

  for (const choice of prev.skilledProficiencyChoices ?? []) {
    if (choice.startsWith('skill:')) {
      const key = choice.slice('skill:'.length);
      if (key) newSkillProficiencies[key] = false;
    }
  }

  return {
    ...(opts.includeClassSkills ? { classSkillProficiencyKeys: [] } : {}),
    raceTraitSelections: newRaceTraitSelections,
    skilledProficiencyChoices: [],
    skillProficiencies: newSkillProficiencies,
  };
}

type LoadErrorKind = 'not-found' | 'unauthorized' | 'mismatch' | 'generic';

// Brief, intentional "Salvo!" confirmation before navigating, so a near-instant save reads as a
// completed action instead of a page flash.
const SAVE_CONFIRMATION_MS = 700;

export function SheetEditor({ pack, initialSheetId = null }: SheetEditorProps) {
  const router = useRouter();
  const { data, setData, featsRef, recalc, handleChange } = useCharacterFormState('editor');
  const { save, saving, saved, saveError, setSaveError, saveErrorStatus } = useSaveSheet();

  const [sheetId, setSheetId] = useState<string | null>(null);
  const [sheetLoading, setSheetLoading] = useState(false);
  const [loadErrorKind, setLoadErrorKind] = useState<LoadErrorKind | null>(null);
  // Bumped by "Tentar novamente" to re-run the load effect after a transient failure.
  const [reloadNonce, setReloadNonce] = useState(0);
  // After a blocked save, sections flag their required-but-empty fields in red (live, until valid).
  const [saveAttempted, setSaveAttempted] = useState(false);
  // Holds the "Salvo!" confirmation while the post-save redirect is pending.
  const [redirecting, setRedirecting] = useState(false);
  const redirectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (redirectTimerRef.current) clearTimeout(redirectTimerRef.current);
    },
    [],
  );

  const library = useRuleLibrary(pack.id);

  const {
    classes,
    backgrounds,
    races,
    abilities,
    feats,
    armors,
    gamingSets,
    musicalInstruments,
    artisanTools,
    tools,
    allItems,
  } = library.lists;
  const { weapons, adventuringGear, toolItemsByCategory, standardLanguages } = library;
  featsRef.current = feats;

  const itemsLoading = library.loading.allItems;

  // Lookup uses every loaded ITEM source so save can resolve ids even when one query is incomplete.
  const equipmentLookupItems = useMemo(() => {
    const merged = [
      ...allItems,
      ...weapons,
      ...armors,
      ...gamingSets,
      ...musicalInstruments,
      ...artisanTools,
      ...tools,
      ...adventuringGear,
    ];
    const byId = new Map<string, RuleItemResponse>();
    for (const it of merged) {
      if (!it?.id || !it?.name || byId.has(it.id)) continue;
      byId.set(it.id, it);
    }
    return [...byId.values()];
  }, [allItems, weapons, armors, gamingSets, musicalInstruments, artisanTools, tools, adventuringGear]);

  const itemById = useMemo(() => {
    const m = new Map<string, RuleItemResponse>();
    for (const it of equipmentLookupItems) m.set(it.id, it);
    return m;
  }, [equipmentLookupItems]);

  const itemIdByLookupKey = useMemo(
    () =>
      buildEquipmentItemIdLookupMap(
        equipmentLookupItems.map((it) => ({ id: it.id, name: it.name }))
      ),
    [equipmentLookupItems]
  );
  const allSkillOptions = useMemo(
    () => getSkillsFromAbilities(abilities).map((s) => ({ key: s.key, label: s.name })),
    [abilities],
  );
  const skillOptsKey = allSkillOptions.map((o) => o.key).sort().join(',');

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

  const equipmentItemsLoading =
    library.loading.weapons || library.loading.armors || library.loading.unarmedStrike;
  const catalogLoading =
    library.loading.classes ||
    library.loading.races ||
    library.loading.backgrounds ||
    library.loading.abilities;

  // Persistência usa só *RuleItemId; nomes de exibição vêm do pack (fonte de verdade no banco).
  useEffect(() => {
    recalc((prev) => {
      const patch: Partial<CharacterFormData> = {};
      if (prev.classRuleItemId) {
        const name = classes.find((c) => c.id === prev.classRuleItemId)?.name?.trim() ?? '';
        if (name && prev.className !== name) patch.className = name;
      }
      if (prev.raceRuleItemId) {
        const name = races.find((r) => r.id === prev.raceRuleItemId)?.name?.trim() ?? '';
        if (name && prev.race !== name) patch.race = name;
      }
      if (prev.backgroundRuleItemId) {
        const name =
          backgrounds.find((b) => b.id === prev.backgroundRuleItemId)?.name?.trim() ?? '';
        if (name && prev.background !== name) patch.background = name;
      }
      if (Object.keys(patch).length === 0) return prev;
      return { ...prev, ...patch };
    });
  }, [
    classes,
    races,
    backgrounds,
    data.classRuleItemId,
    data.raceRuleItemId,
    data.backgroundRuleItemId,
    recalc,
  ]);

  const lastDerivedRef = useRef({
    classId: null as string | null,
    raceId: null as string | null,
    bgId: null as string | null,
    level: 1,
    skillOptsKey: '',
    /** Muda quando listas de rule items passam a resolver os ids (evita derived “vazio” e skip permanente). */
    ruleDataKey: '',
  });

  const prevClassIdForSpellsRef = useRef(data.classRuleItemId ?? null);
  const prevBackgroundIdForSkillsRef = useRef(data.backgroundRuleItemId ?? null);

  const loadedSheetKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const id = initialSheetId?.trim() || '';
    if (!id) {
      loadedSheetKeyRef.current = null;
      setLoadErrorKind(null);
      setSheetLoading(false);
      return;
    }
    if (loadedSheetKeyRef.current === id) return;
    let cancelled = false;
    setSheetLoading(true);
    setLoadErrorKind(null);
    (async () => {
      try {
        const res = await characterSheetsApi.getById(id);
        if (cancelled) return;
        if (res.packId !== pack.id) {
          setLoadErrorKind('mismatch');
          setSheetLoading(false);
          return;
        }
        loadedSheetKeyRef.current = id;
        setSheetId(res.id);
        const merged = mergeCharacterFormDataFromApi(res.data, res.schemaVersion);
        prevClassIdForSpellsRef.current = merged.classRuleItemId ?? null;
        prevBackgroundIdForSkillsRef.current = merged.backgroundRuleItemId ?? null;
        lastDerivedRef.current = {
          classId: null,
          raceId: null,
          bgId: null,
          level: -1,
          skillOptsKey: '',
          ruleDataKey: '',
        };
        recalc(() => merged);
      } catch (e) {
        if (cancelled) return;
        loadedSheetKeyRef.current = null;
        if (isAxiosError(e) && e.response?.status === 401) {
          setLoadErrorKind('unauthorized');
        } else if (isAxiosError(e) && e.response?.status === 404) {
          setLoadErrorKind('not-found');
        } else {
          setLoadErrorKind('generic');
        }
      } finally {
        if (!cancelled) setSheetLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialSheetId, pack.id, recalc, reloadNonce]);

  // Rebuild `data.equipment` from `{ equipment: { gold, items } }` once catalog names resolve for ids.
  useEffect(() => {
    const entries = data.equipmentPersistedItems ?? [];
    const needsCatalog = entries.some((e) => e.id);
    if (needsCatalog && itemsLoading) return;
    recalc((prev) => {
      const patch = buildEquipmentRestorePatch(prev, (id) => itemById.get(id)?.name, {
        gold: prev.equipmentGold ?? 0,
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

  // Clear manually-selected spells, slots and skill choices when the class itself changes. The
  // class-feature selections (Weapon Mastery, Expertise, Metamagic, option cards, …) are reset
  // source-aware inside applyDerivedToCharacterData via its `classChanged` flag — see below.
  useEffect(() => {
    const curClassId = data.classRuleItemId ?? null;
    if (prevClassIdForSpellsRef.current === curClassId) return;
    const isFirstMount = prevClassIdForSpellsRef.current === null && curClassId !== null;
    prevClassIdForSpellsRef.current = curClassId;
    if (isFirstMount) return;
    recalc((prev) => {
      const skillPatch = buildSkillChoicesResetPatch(prev, { includeClassSkills: true });
      return {
        ...prev,
        ...skillPatch,
        spellsByLevel: {},
        spellSlots: {},
        mysticArcanumSpellNamesByGain: [],
        signatureSpellsSpellNames: [],
        spellMasterySpellNamesByLevel: {},
        wizardSpellbookByLevel: {},
        wizardSpellbookByScrollByLevel: {},
      };
    });
  }, [data.classRuleItemId, recalc]);

  // Clear all skill choices when the background is selected or changed.
  useEffect(() => {
    const curBgId = data.backgroundRuleItemId ?? null;
    if (prevBackgroundIdForSkillsRef.current === curBgId) return;
    prevBackgroundIdForSkillsRef.current = curBgId;
    if (!curBgId) return;
    recalc((prev) => {
      const skillPatch = buildSkillChoicesResetPatch(prev, {
        includeClassSkills: true,
        includeBackgroundSkills: true,
      });
      return { ...prev, ...skillPatch };
    });
  }, [data.backgroundRuleItemId, recalc]);

  useEffect(() => {
    const { classRuleItemId, raceRuleItemId, backgroundRuleItemId, level } = data;
    const classItem =
      classRuleItemId != null ? (classes.find((c) => c.id === classRuleItemId) ?? null) : null;
    const raceItem =
      raceRuleItemId != null ? (races.find((r) => r.id === raceRuleItemId) ?? null) : null;
    const bgItem =
      backgroundRuleItemId != null
        ? (backgrounds.find((b) => b.id === backgroundRuleItemId) ?? null)
        : null;

    // Do not derive until lists contain the selected rule items. Running with null
    // class/race/bg items yields incomplete featureDetails and clears persisted
    // choices (fingerprint vs empty class names, raceTraitSelections vs missing race features).
    if (classRuleItemId != null && classItem == null) return;
    if (raceRuleItemId != null && raceItem == null) return;
    if (backgroundRuleItemId != null && bgItem == null) return;

    const classResolved =
      classRuleItemId == null || classes.some((c) => c.id === classRuleItemId);
    const raceResolved = raceRuleItemId == null || races.some((r) => r.id === raceRuleItemId);
    const bgResolved =
      backgroundRuleItemId == null ||
      backgrounds.some((b) => b.id === backgroundRuleItemId);
    const ruleDataKey = [
      classResolved ? '1' : '0',
      raceResolved ? '1' : '0',
      bgResolved ? '1' : '0',
      feats.length,
      allSkillOptions.length,
    ].join(':');

    const prev = lastDerivedRef.current;
    if (
      prev.classId === (classRuleItemId ?? null) &&
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
      raceId: raceRuleItemId ?? null,
      bgId: backgroundRuleItemId ?? null,
      level,
      skillOptsKey,
      ruleDataKey,
    };
    const derived = getDerivedFromRuleItems(
      classItem,
      raceItem,
      bgItem,
      data.level,
      feats,
      allSkillOptions,
    );
    setData((prevData) => applyDerivedToCharacterData(prevData, derived, feats, classChanged));
  }, [
    data.classRuleItemId,
    data.raceRuleItemId,
    data.backgroundRuleItemId,
    data.level,
    classes,
    races,
    backgrounds,
    feats,
    allSkillOptions,
    skillOptsKey,
  ]);

  // Redistribute persisted tool picks into their "Choose…" slots once the tool catalog loads;
  // idempotent (clears the transient snapshot), so it settles after one pass and can't loop.
  useEffect(() => {
    setData((prev) => {
      const patch = seedToolProficiencyChoicesFromPersisted(prev, toolItemsByCategory);
      return patch ? { ...prev, ...patch } : prev;
    });
  }, [setData, toolItemsByCategory, data.persistedToolProficiencies, data.proficiencies]);

  const skillsListForValidation = useMemo(
    () => getSkillsFromAbilities(abilities).map((s) => ({ key: s.key, name: s.name })),
    [abilities]
  );

  const canSave = !sheetLoading;

  // Serialize equipment as `{ gold, items: [{ id, quantity }] }`.
  const buildPayload = () =>
    toPersistedCharacterPayload(
      data,
      buildResolvedProficiencies(data, {
        toolItemsByCategory,
        standardLanguageOptions: standardLanguages,
      }),
      {
        gold: getAvailableGP(data.equipment, data.equipmentSpentGP ?? 0),
        items: resolveEquipmentPersistedItems(data, itemIdByLookupKey),
      }
    );

  // Hold the "Salvo!" confirmation for a beat, then open the saved sheet in the read-only view
  // (the success toast carries over to the destination).
  const goToSavedSheet = (id: string) => {
    setRedirecting(true);
    redirectTimerRef.current = setTimeout(() => router.push(`/sheets/${id}`), SAVE_CONFIRMATION_MS);
  };

  const handleSave = async () => {
    setSaveError(null);

    const validationErrors = getCharacterSheetSaveValidationErrors(data, {
      standardLanguageOptions: standardLanguages,
      skillsList: skillsListForValidation,
      feats,
    });
    if (validationErrors.length > 0) {
      setSaveAttempted(true);
      toast.error('Ficha incompleta', {
        description: 'Preencha os campos destacados em vermelho.',
      });
      return;
    }
    setSaveAttempted(false);

    const id = await save({ sheetId, packId: pack.id, payload: buildPayload() });
    if (id) goToSavedSheet(id);
  };

  // The open sheet was deleted server-side (PATCH → 404). Persist the current state as a brand-new
  // sheet instead of losing the user's work, then open it.
  const handleSaveAsNew = async () => {
    setSaveError(null);
    const id = await save({ sheetId: null, packId: pack.id, payload: buildPayload() });
    if (id) goToSavedSheet(id);
  };

  if (loadErrorKind) {
    const view = {
      'not-found': {
        title: 'Esta ficha não existe mais',
        description: 'Ela pode ter sido excluída. Volte para Minhas Fichas ou crie uma nova.',
        showCreateNew: true,
        showRetry: false,
      },
      unauthorized: {
        title: 'Faça login para carregar fichas salvas',
        description: 'Sua sessão pode ter expirado. Entre novamente para continuar.',
        showCreateNew: false,
        showRetry: false,
      },
      mismatch: {
        title: 'Esta ficha pertence a outro sistema',
        description: 'Abra o link com o sistema de regras correto para visualizá-la.',
        showCreateNew: false,
        showRetry: false,
      },
      generic: {
        title: 'Não foi possível carregar a ficha',
        description: 'Verifique sua conexão e tente novamente.',
        showCreateNew: false,
        showRetry: true,
      },
    }[loadErrorKind];

    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-card px-6 py-16 text-center">
        <p className="font-serif text-lg font-semibold text-foreground">{view.title}</p>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">{view.description}</p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Button onClick={() => router.push('/sheets')}>Voltar para Minhas Fichas</Button>
          {view.showCreateNew ? (
            <Button
              variant="outline"
              onClick={() => router.push(`/create?packId=${encodeURIComponent(pack.id)}`)}
            >
              Criar nova ficha
            </Button>
          ) : null}
          {view.showRetry ? (
            <Button
              variant="outline"
              onClick={() => {
                loadedSheetKeyRef.current = null;
                setReloadNonce((n) => n + 1);
              }}
            >
              Tentar novamente
            </Button>
          ) : null}
        </div>
      </div>
    );
  }

  if (catalogLoading) {
    return <LoadingState />;
  }

  return (
    <>
      <div className="mb-6 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="font-serif text-2xl font-bold text-foreground">Criação Manual</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Sistema: <span className="font-medium text-foreground">{pack.name}</span>
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <Button
            type="button"
            disabled={!canSave || saving || redirecting}
            onClick={() => void handleSave()}
            aria-label={saving ? 'Salvando' : undefined}
          >
            {saved || redirecting ? (
              <>
                <Check className="mr-2 h-4 w-4" aria-hidden="true" />
                Salvo!
              </>
            ) : saving ? (
              <Spinner size="sm" />
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" aria-hidden="true" />
                Salvar Ficha
              </>
            )}
          </Button>
          {saveError ? (
            <div className="flex flex-col items-end gap-1.5">
              <p className="max-w-xs text-right text-sm text-destructive">{saveError}</p>
              {saveErrorStatus === 404 && sheetId ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={saving || redirecting}
                  onClick={() => void handleSaveAsNew()}
                >
                  Salvar como nova ficha
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {sheetLoading ? <LoadingState inline className="mb-4" /> : null}

      <CharacterSheet
        data={data}
        classes={classes}
        backgrounds={backgrounds}
        races={races}
        abilities={abilities}
        weapons={weapons}
        armors={armors}
        adventuringGear={adventuringGear}
        feats={feats}
        toolItemsByCategory={toolItemsByCategory}
        standardLanguageOptions={standardLanguages}
        classesLoading={library.loading.classes}
        backgroundsLoading={library.loading.backgrounds}
        racesLoading={library.loading.races}
        abilitiesLoading={library.loading.abilities}
        equipmentItemsLoading={equipmentItemsLoading}
        onChange={handleChange}
        readOnly={false}
        saveAttempted={saveAttempted}
      />
    </>
  );
}
