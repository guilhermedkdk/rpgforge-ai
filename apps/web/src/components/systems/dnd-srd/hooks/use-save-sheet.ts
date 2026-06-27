'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { toast } from 'sonner';
import { characterSheetsApi } from '@/lib/api/character-sheets';
import { persistedCharacterDataSchema } from '@rpgforce-ai/shared';

const saveErrorMessage = (e: unknown): string => {
  if (isAxiosError(e) && e.response?.status === 401) return 'Faça login para salvar a ficha.';
  if (isAxiosError(e) && e.response?.status === 404) return 'Esta ficha foi excluída.';
  if (isAxiosError(e) && e.response?.data && typeof e.response.data === 'object') {
    const msg = (e.response.data as { message?: string | string[] }).message;
    if (typeof msg === 'string') return msg;
    if (Array.isArray(msg)) return msg.join(', ');
  }
  return 'Não foi possível salvar a ficha.';
};

interface SaveSheetArgs {
  sheetId: string | null;
  packId: string;
  payload: Record<string, unknown>;
}

/**
 * Shared save flow for the editor and the session viewer: create-or-update,
 * success toast, sheets-list invalidation and the transient "Salvo!" flash.
 * Returns the sheet id on success (new id when created), null on failure.
 */
export const useSaveSheet = () => {
  const queryClient = useQueryClient();
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
    [],
  );

  const save = useCallback(
    async ({ sheetId, packId, payload }: SaveSheetArgs): Promise<string | null> => {
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
          const res = await characterSheetsApi.create(packId, payload);
          id = res.id;
        }
        setSaved(true);
        toast.success('Ficha salva com sucesso.');
        void queryClient.invalidateQueries({ queryKey: ['character-sheets', 'list'] });
        if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
        savedTimerRef.current = setTimeout(() => setSaved(false), 2000);
        return id;
      } catch (e) {
        setSaveError(saveErrorMessage(e));
        setSaveErrorStatus(isAxiosError(e) ? (e.response?.status ?? null) : null);
        return null;
      } finally {
        setSaving(false);
      }
    },
    [queryClient],
  );

  return { save, saving, saved, saveError, setSaveError, saveErrorStatus };
};
