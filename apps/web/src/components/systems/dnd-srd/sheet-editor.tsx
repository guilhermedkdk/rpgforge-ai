'use client';

import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import {
  PERSISTED_CHARACTER_SCHEMA_VERSION,
  mergeCharacterFormDataFromApi,
  buildEquipmentItemIdLookupMap,
  type AiDecision,
  type AiSpellNote,
  type PersistedCharacterData,
  type CharacterFormData,
  type PackResponse,
  type RuleItemResponse,
} from '@rpgforce-ai/shared';
import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { LoadingState } from '@/components/ui/loading-state';
import { useStepActions } from '@/components/create/step-actions-slot';
import {
  UnsavedChangesDialog,
  useUnsavedChangesGuard,
} from '@/components/sheets/unsaved-changes-guard';
import { CharacterSheet } from '@/components/systems/dnd-srd/character-sheet';
import { useRuleLibrary } from './library/use-rule-library';
import { useAllSpells } from './character-sheet/sections/spellcasting/hooks/use-all-spells';
import { useAuthGate } from '@/contexts/auth-gate';
import { useSessionDraft } from '@/hooks/use-session-draft';
import { DRAFT_KEYS, takeSessionDraft } from '@/lib/session-draft';
import { useCharacterFormState } from './hooks/use-character-form-state';
import { useSheetDerivation } from './hooks/use-sheet-derivation';
import { useSheetSaveFlow } from './hooks/use-sheet-save-flow';

interface SheetEditorProps {
  pack: PackResponse;
  /** Wired to the bottom bar's "Voltar"; guarded when the draft has content. */
  onBack: () => void;
  /** In-memory persisted-shape draft (AI wizard) to hydrate on mount. */
  initialData?: PersistedCharacterData | null;
  /** AI wizard only: per-area justifications shown as hint markers on the sheet sections. */
  aiDecisions?: AiDecision[] | null;
  /** AI wizard only: per-spell justifications shown as hint markers on spell rows. */
  aiSpellNotes?: AiSpellNote[] | null;
  /** AI wizard only: summary banner rendered below the page header, above the sheet. */
  aiBanner?: ReactNode;
  /** AI wizard only: opaque id of the interaction that produced the draft; sent on save, never shown. */
  generationId?: string;
}

const SKILL_GRANTING_RACE_TRAIT_NAMES = new Set(['skillful', 'keen senses']);

/**
 * Builds a patch that clears the player's own skill choices (class picks, race-trait picks, Skilled).
 * Grants are NOT its business: dropping a grant whose source changed belongs to the shared derivation,
 * which is the only place that sees the old and the new identity at once.
 */
function buildSkillChoicesResetPatch(
  prev: CharacterFormData,
  opts: { includeClassSkills: boolean }
): Partial<CharacterFormData> {
  const newSkillProficiencies = { ...prev.skillProficiencies };

  if (opts.includeClassSkills) {
    for (const k of prev.classSkillProficiencyKeys ?? []) {
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

// Brief, intentional "Salvo!" confirmation before navigating, so a near-instant save reads as a
// completed action instead of a page flash.
const SAVE_CONFIRMATION_MS = 700;

const SIGN_IN_REASON =
  'Sua ficha continua aqui. Entre para salvá-la, e voltamos exatamente para este ponto.';

export function SheetEditor({
  pack,
  onBack,
  initialData = null,
  aiDecisions = null,
  aiSpellNotes = null,
  aiBanner = null,
  generationId,
}: SheetEditorProps) {
  const router = useRouter();
  const { data, setData, featsRef, recalc, handleChange } = useCharacterFormState();
  const { requireAuth, promptSignIn } = useAuthGate();
  // The save to replay if the API turns out to want a session.
  const replayRef = useRef<(() => void) | null>(null);
  // Declared up here because the draft restore below has to arm it before any edit happens.
  const userInteractedRef = useRef(false);

  // Holds the "Salvo!" confirmation while the post-save redirect is pending.
  const [redirecting, setRedirecting] = useState(false);
  const redirectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (redirectTimerRef.current) clearTimeout(redirectTimerRef.current);
    },
    []
  );

  const library = useRuleLibrary(pack.id);
  // Full spell catalog (cached; shared with the spellcasting section) so save-validation can cap each
  // "pick N spells" requirement at what the pool actually offers. Resolve the packId the SAME way the
  // spellcasting section does (from the class/race rule item) so both share one cached request.
  const spellPackId =
    library.lists.classes.find((c) => c.id === data.classRuleItemId)?.packId ??
    library.lists.races.find((r) => r.id === data.raceRuleItemId)?.packId ??
    pack.id;
  const { allSpells } = useAllSpells(spellPackId);

  const {
    classes,
    subclasses,
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
  }, [
    allItems,
    weapons,
    armors,
    gamingSets,
    musicalInstruments,
    artisanTools,
    tools,
    adventuringGear,
  ]);

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

  // Resolves any class/subclass id, so a multiclass build derives every class it has levels in.
  const resolveRuleItem = useCallback(
    (id: string | null | undefined) =>
      id ? (classes.find((c) => c.id === id) ?? subclasses.find((s) => s.id === id) ?? null) : null,
    [classes, subclasses]
  );

  const identity = useMemo(
    () => ({
      classItem: data.classRuleItemId
        ? (classes.find((c) => c.id === data.classRuleItemId) ?? null)
        : null,
      subclassItem: data.subclassRuleItemId
        ? (subclasses.find((s) => s.id === data.subclassRuleItemId) ?? null)
        : null,
      raceItem: data.raceRuleItemId
        ? (races.find((r) => r.id === data.raceRuleItemId) ?? null)
        : null,
      bgItem: data.backgroundRuleItemId
        ? (backgrounds.find((b) => b.id === data.backgroundRuleItemId) ?? null)
        : null,
      resolveRuleItem,
    }),
    [
      classes,
      subclasses,
      races,
      backgrounds,
      data.classRuleItemId,
      data.subclassRuleItemId,
      data.raceRuleItemId,
      data.backgroundRuleItemId,
      resolveRuleItem,
    ]
  );

  const { requestRederive } = useSheetDerivation({
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
  });

  const { validateAndSave, pendingCount, saving, saved, saveError, saveAttempted } =
    useSheetSaveFlow({
      data,
      mode: 'creation',
      packId: pack.id,
      generationId,
      sheetId: null,
      abilities,
      feats,
      classes,
      subclasses,
      standardLanguages,
      toolItemsByCategory,
      allSpells,
      itemIdByLookupKey,
      onUnauthorized: () => {
        const replay = replayRef.current;
        if (replay) promptSignIn(replay, { reason: SIGN_IN_REASON });
      },
    });

  const equipmentItemsLoading =
    library.loading.weapons || library.loading.armors || library.loading.unarmedStrike;
  const catalogLoading =
    library.loading.classes ||
    library.loading.races ||
    library.loading.backgrounds ||
    library.loading.abilities;

  const prevClassIdForSpellsRef = useRef(data.classRuleItemId ?? null);
  const prevBackgroundIdForSkillsRef = useRef(data.backgroundRuleItemId ?? null);
  const hydratedDraftRef = useRef(false);

  // Hydrate once — same merge+derive path a saved sheet takes, minus the fetch.
  //
  // A stored draft outranks `initialData`: it is that same sheet plus whatever was changed after the
  // wizard handed it over, and it is what a sign-in round trip left behind. It restores before the
  // rule catalog resolves, so the sheet never paints empty first.
  useEffect(() => {
    if (hydratedDraftRef.current) return;
    const stored = takeSessionDraft<CharacterFormData>(DRAFT_KEYS.createManual);
    const source =
      stored ??
      (initialData
        ? mergeCharacterFormDataFromApi(initialData, PERSISTED_CHARACTER_SCHEMA_VERSION)
        : null);
    if (!source) return;
    hydratedDraftRef.current = true;
    // Without this a restored draft counts as untouched, and leaving the page would wipe it.
    if (stored) userInteractedRef.current = true;
    prevClassIdForSpellsRef.current = source.classRuleItemId ?? null;
    prevBackgroundIdForSkillsRef.current = source.backgroundRuleItemId ?? null;
    requestRederive();
    recalc(() => source);
  }, [initialData, recalc, requestRederive]);

  // Clear manually-selected spells, slots and skill choices when the class itself changes. The
  // class-feature selections (Weapon Mastery, Expertise, Metamagic, option cards, …) are reset
  // source-aware inside applyDerivedToCharacterData via its `classChanged` flag.
  useEffect(() => {
    const curClassId = data.classRuleItemId ?? null;
    if (prevClassIdForSpellsRef.current === curClassId) return;
    // Mid-hydration (AI draft passed via initialData) the class id momentarily reads null on the
    // first render while the draft is applied; never treat that transient null as a class change,
    // or it wipes the spells the draft just supplied. Mirrors the `!curBgId` guard below.
    if (!curClassId) return;
    const isFirstMount = prevClassIdForSpellsRef.current === null && curClassId !== null;
    prevClassIdForSpellsRef.current = curClassId;
    if (isFirstMount) return;
    requestRederive();
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
  }, [data.classRuleItemId, recalc, requestRederive]);

  // Clear all skill choices when the background is selected or changed.
  useEffect(() => {
    const curBgId = data.backgroundRuleItemId ?? null;
    if (prevBackgroundIdForSkillsRef.current === curBgId) return;
    // The transient null must be checked BEFORE the ref is written, like the class effect above.
    // Writing it first threw away the id the hydration effect had just primed (mid-hydration this
    // reads null for one render), so the next render saw the draft's background as a CHANGE and the
    // reset wiped the draft's own Keen Senses / Skillful picks on every AI draft with an Elf or a
    // Human. A first manual selection still resets, which is the point of this effect.
    if (!curBgId) return;
    prevBackgroundIdForSkillsRef.current = curBgId;
    requestRederive();
    recalc((prev) => {
      const skillPatch = buildSkillChoicesResetPatch(prev, { includeClassSkills: true });
      return { ...prev, ...skillPatch };
    });
  }, [data.backgroundRuleItemId, recalc, requestRederive]);

  // A draft only exists in memory: leaving the page throws it away (an AI draft cost a model call to
  // produce), so the guard is armed as soon as there is something to lose and disarmed once saved.
  const [savedOk, setSavedOk] = useState(false);
  const hasDraft = !savedOk && (initialData != null || userInteractedRef.current);
  const guard = useUnsavedChangesGuard(hasDraft);

  const handleChangeGuarded = (next: CharacterFormData) => {
    userInteractedRef.current = true;
    handleChange(next);
  };

  // Hold the "Salvo!" confirmation for a beat, then open the saved sheet (the success toast carries
  // over to the destination).
  const runSave = async () => {
    const id = await validateAndSave();
    if (!id) return;
    setSavedOk(true);
    setRedirecting(true);
    redirectTimerRef.current = setTimeout(() => router.push(`/sheets/${id}`), SAVE_CONFIRMATION_MS);
  };

  // Asks for the session BEFORE validating and posting; the 401 path stays as the safety net for a
  // session that expired while the sheet sat open.
  const handleSave = () => {
    const replay = () => void runSave();
    replayRef.current = replay;
    requireAuth(replay, { reason: SIGN_IN_REASON });
  };

  useSessionDraft<CharacterFormData>(DRAFT_KEYS.createManual, () => data);

  // The bar itself belongs to the create page, which keeps it mounted across every step; this only
  // supplies what it shows. Inline handlers are fine here: the slot keeps them in a ref.
  useStepActions({
    onBack: () => guard.guard(onBack),
    onContinue: handleSave,
    canContinue: !catalogLoading,
    loading: saving || redirecting,
    continueLabel: saved || redirecting ? 'Salvo!' : 'Salvar Ficha',
    continueIcon: 'none',
    status: catalogLoading
      ? null
      : saveError
        ? { kind: 'error', message: saveError }
        : { kind: 'progress', pending: pendingCount },
  });

  return (
    <>
      {catalogLoading ? (
        <LoadingState />
      ) : (
        <div className="content-reveal pb-14">
          <div className="mb-6">
            <h1 className="font-serif text-2xl font-bold text-foreground">
              {initialData ? 'Sua Ficha está Pronta' : 'Criação Manual'}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Sistema: <span className="font-medium text-foreground">{pack.name}</span>
              {initialData ? ' · revise e altere o que quiser antes de salvar' : null}
            </p>
          </div>

          {aiBanner ? <div className="mb-6">{aiBanner}</div> : null}

          <CharacterSheet
            data={data}
            aiDecisions={aiDecisions}
            aiSpellNotes={aiSpellNotes}
            classes={classes}
            subclasses={subclasses}
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
            subclassesLoading={library.loading.subclasses}
            backgroundsLoading={library.loading.backgrounds}
            racesLoading={library.loading.races}
            abilitiesLoading={library.loading.abilities}
            equipmentItemsLoading={equipmentItemsLoading}
            onChange={handleChangeGuarded}
            mode="creation"
            saveAttempted={saveAttempted}
          />
        </div>
      )}

      <UnsavedChangesDialog
        open={guard.isConfirming}
        onConfirm={guard.confirm}
        onCancel={guard.cancel}
        title="Descartar esta ficha?"
        description="Esta ficha ainda não foi salva. Se você sair agora, tudo o que preencheu será perdido."
        confirmLabel="Descartar ficha"
      />
    </>
  );
}
