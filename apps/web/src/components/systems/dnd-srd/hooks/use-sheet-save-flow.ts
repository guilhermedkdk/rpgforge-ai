'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  buildResolvedProficiencies,
  getAvailableGP,
  getCharacterSheetSaveValidationErrors,
  getSkillsFromAbilities,
  resolveEquipmentPersistedItems,
  toPersistedCharacterPayload,
  type CharacterFormData,
  type RuleItemResponse,
} from '@rpgforce-ai/shared';
import type { SheetMode } from '@/components/systems/dnd-srd/character-sheet/types';
import { useSaveSheet } from './use-save-sheet';

interface UseSheetSaveFlowArgs {
  data: CharacterFormData;
  mode: SheetMode;
  packId: string;
  /** AI drafts only: the wizard interaction to persist with the sheet on its first save. */
  generationId?: string;
  /** Null creates a new sheet; set updates it. */
  sheetId: string | null;
  abilities: RuleItemResponse[];
  feats: RuleItemResponse[];
  classes: RuleItemResponse[];
  subclasses: RuleItemResponse[];
  standardLanguages: RuleItemResponse[];
  toolItemsByCategory: Record<string, RuleItemResponse[]>;
  /** Full spell catalog; caps each "pick N spells" requirement at what the pool offers. */
  allSpells: RuleItemResponse[];
  /** Equipment name → rule-item id, for serializing the equipment text back to ids. */
  itemIdByLookupKey: Map<string, string>;
  /** Answer to a 401: raise the sign-in dialog and replay the save, instead of a dead-end message. */
  onUnauthorized?: () => void;
}

// The red flagging decays on its own, so it can never become a permanent state of the sheet. Two
// mechanisms, deliberately split: acting on ONE pending field silences THAT field (per-field, in
// `character-sheet/pending-flags`), and this timer drops whatever is left when the player just stares.
// Comfortably longer than the toast, so the two never contradict each other. What remains underneath is
// the ambient orange "needs a choice" cue, which is why letting the red go loses nothing.
const SAVE_ATTEMPT_HIGHLIGHT_MS = 10_000;

/**
 * The save gate shared by the creation editor and the saved sheet: it runs the SAME shared validation
 * the backend enforces, then persists.
 *
 * An incomplete sheet has exactly ONE presentation — the pending fields turn red plus one short toast.
 * The API's 400 body enumerates every pending choice, but that list is dev-facing and is never
 * rendered: a server rejection is routed to the same red-field treatment, so a front/back divergence
 * shows up as a bug to fix at the source instead of as a wall of text for the user.
 */
export function useSheetSaveFlow({
  data,
  mode,
  packId,
  generationId,
  sheetId,
  abilities,
  feats,
  classes,
  subclasses,
  standardLanguages,
  toolItemsByCategory,
  allSpells,
  itemIdByLookupKey,
  onUnauthorized,
}: UseSheetSaveFlowArgs) {
  // After a blocked save, sections flag their required-but-empty fields in red (live, until valid).
  const [saveAttempted, setSaveAttempted] = useState(false);

  const flagIncompleteSheet = useCallback(() => {
    setSaveAttempted(true);
    toast.error('Ficha incompleta', { description: 'Preencha os campos destacados em vermelho.' });
  }, []);

  useEffect(() => {
    if (!saveAttempted) return;
    const timer = setTimeout(() => setSaveAttempted(false), SAVE_ATTEMPT_HIGHLIGHT_MS);
    return () => clearTimeout(timer);
  }, [saveAttempted]);

  const { save, saving, saved, saveError, setSaveError, saveErrorStatus } = useSaveSheet({
    onValidationRejected: flagIncompleteSheet,
    onUnauthorized,
  });

  const buildPayload = useCallback(
    () =>
      toPersistedCharacterPayload(
        data,
        buildResolvedProficiencies(data, {
          toolItemsByCategory,
          standardLanguageOptions: standardLanguages,
        }),
        {
          // Creation spends a gold BUDGET carried in the equipment text; in play the coins are the
          // real wallet on `data`, so omitting `gold` tells the payload to read those integers.
          ...(mode === 'creation'
            ? { gold: getAvailableGP(data.equipment, data.equipmentSpentGP ?? 0) }
            : {}),
          items: resolveEquipmentPersistedItems(data, itemIdByLookupKey),
        }
      ),
    [data, mode, itemIdByLookupKey, standardLanguages, toolItemsByCategory]
  );

  // Live, not save-time: the creation bar reports how many choices are still pending, so a new sheet
  // stops hiding its own state until the first blocked save. Measured at 0.28ms on a level-20 sheet
  // with the full spell catalog, so running it per data change is free.
  const validationErrors = useMemo(
    () =>
      getCharacterSheetSaveValidationErrors(data, {
        standardLanguageOptions: standardLanguages,
        skillsList: getSkillsFromAbilities(abilities).map((s) => ({ key: s.key, name: s.name })),
        feats,
        classes,
        subclasses,
        allSpells: allSpells.length > 0 ? allSpells : undefined,
      }),
    [data, standardLanguages, abilities, feats, classes, subclasses, allSpells]
  );

  /** Validates, then creates or updates. Returns the sheet id, or null when blocked/failed. */
  const validateAndSave = useCallback(
    async (overrides?: { sheetId?: string | null }): Promise<string | null> => {
      setSaveError(null);
      if (validationErrors.length > 0) {
        flagIncompleteSheet();
        return null;
      }
      setSaveAttempted(false);
      return save({
        sheetId: overrides?.sheetId !== undefined ? overrides.sheetId : sheetId,
        packId,
        generationId,
        payload: buildPayload(),
      });
    },
    [
      buildPayload,
      flagIncompleteSheet,
      generationId,
      packId,
      save,
      setSaveError,
      sheetId,
      validationErrors,
    ]
  );

  return {
    validateAndSave,
    /** How many requirements are still unmet right now (0 = savable). */
    pendingCount: validationErrors.length,
    saving,
    saved,
    saveError,
    saveErrorStatus,
    saveAttempted,
    flagIncompleteSheet,
  };
}
