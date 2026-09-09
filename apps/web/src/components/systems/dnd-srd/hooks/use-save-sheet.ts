'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { toast } from 'sonner';
import { characterSheetsApi } from '@/lib/api/character-sheets';
import { persistedCharacterDataSchema } from '@rpgforce-ai/shared';

// The API's 400 body enumerates every pending choice — dev-facing detail. It is never rendered:
// an incomplete sheet is surfaced by `onValidationRejected` (red fields + one short toast).
const saveErrorMessage = (e: unknown): string => {
  if (isAxiosError(e) && e.response?.status === 404) return 'Esta ficha foi excluída.';
  if (isAxiosError(e) && e.response?.status === 400) return 'Ficha incompleta ou inválida.';
  return 'Não foi possível salvar a ficha.';
};

interface SaveSheetArgs {
  sheetId: string | null;
  packId: string;
  payload: Record<string, unknown>;
  /** AI drafts only: the wizard interaction this sheet came from. */
  generationId?: string;
}

interface UseSaveSheetOptions {
  /**
   * Called instead of setting `saveError` when the API rejects the sheet as incomplete (400), so the
   * caller can show its own inline field highlighting rather than a message.
   */
  onValidationRejected?: () => void;
  /**
   * Called instead of setting `saveError` when the API refuses for lack of a session, so the caller
   * can raise the sign-in dialog and replay the save with the sheet still on screen.
   */
  onUnauthorized?: () => void;
}

/**
 * Shared save flow for the editor and the session viewer: create-or-update,
 * success toast, sheets-list invalidation and the transient "Salvo!" flash.
 * Returns the sheet id on success (new id when created), null on failure.
 */
export const useSaveSheet = ({
  onValidationRejected,
  onUnauthorized,
}: UseSaveSheetOptions = {}) => {
  const queryClient = useQueryClient();
  const onValidationRejectedRef = useRef(onValidationRejected);
  onValidationRejectedRef.current = onValidationRejected;
  const onUnauthorizedRef = useRef(onUnauthorized);
  onUnauthorizedRef.current = onUnauthorized;
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // HTTP status of the last failed save — lets callers special-case 404 (sheet deleted).
  const [saveErrorStatus, setSaveErrorStatus] = useState<number | null>(null);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    },
    []
  );

  const save = useCallback(
    async ({ sheetId, packId, payload, generationId }: SaveSheetArgs): Promise<string | null> => {
      if (process.env.NODE_ENV === 'development') {
        // Surface payload/schema drift early — the API rejects invalid payloads with 400.
        const check = persistedCharacterDataSchema.safeParse(payload);
        if (!check.success) {
          console.warn('Sheet payload failed schema validation:', check.error.issues);
        }
      }
      setSaveError(null);
      setSaveErrorStatus(null);
      setSaving(true);
      try {
        let id = sheetId;
        if (id) {
          await characterSheetsApi.update(id, payload);
        } else {
          const res = await characterSheetsApi.create(packId, payload, generationId);
          id = res.id;
        }
        setSaved(true);
        toast.success('Ficha salva com sucesso.');
        void queryClient.invalidateQueries({ queryKey: ['character-sheets', 'list'] });
        if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
        savedTimerRef.current = setTimeout(() => setSaved(false), 2000);
        return id;
      } catch (e) {
        const status = isAxiosError(e) ? (e.response?.status ?? null) : null;
        setSaveErrorStatus(status);
        if (status === 400 && onValidationRejectedRef.current) {
          setSaveError(null);
          onValidationRejectedRef.current();
          return null;
        }
        if (status === 401 && onUnauthorizedRef.current) {
          setSaveError(null);
          onUnauthorizedRef.current();
          return null;
        }
        setSaveError(saveErrorMessage(e));
        return null;
      } finally {
        setSaving(false);
      }
    },
    [queryClient]
  );

  return { save, saving, saved, saveError, setSaveError, saveErrorStatus };
};
