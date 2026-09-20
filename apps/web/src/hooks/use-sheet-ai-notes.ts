'use client';

import { useCallback, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { AiDecision, AiSpellNote } from '@rpgforce-ai/shared';
import { characterSheetsApi } from '@/lib/api/character-sheets';

const storageKey = (sheetId: string): string => `rpgforge:ai-notes:${sheetId}`;

// Per viewer and per sheet, so turning the markers off on one character says nothing about the next
// one. A blocked or empty store reads as "show them", which is the state a new sheet opens in.
const readPreference = (sheetId: string): boolean => {
  if (typeof window === 'undefined') return true;
  try {
    return window.localStorage.getItem(storageKey(sheetId)) !== 'off';
  } catch {
    return true;
  }
};

const writePreference = (sheetId: string, visible: boolean): void => {
  try {
    window.localStorage.setItem(storageKey(sheetId), visible ? 'on' : 'off');
  } catch {
    // A viewer with site data blocked keeps the toggle for this visit and loses it on reload.
  }
};

interface SheetAiNotes {
  visible: boolean;
  toggle: () => void;
  loading: boolean;
  decisions: AiDecision[] | null;
  spellNotes: AiSpellNote[] | null;
}

/**
 * The saved sheet's AI justifications, fetched the first time the reader asks to see them and cached
 * for the rest of the visit (a generation log never changes once written).
 */
export const useSheetAiNotes = (sheetId: string, available: boolean): SheetAiNotes => {
  const [visible, setVisible] = useState(() => available && readPreference(sheetId));

  const { data, isFetching, isError } = useQuery({
    queryKey: ['sheet-ai-notes', sheetId],
    queryFn: () => characterSheetsApi.getAiNotes(sheetId),
    enabled: available && visible,
    staleTime: Infinity,
    retry: false,
  });

  useEffect(() => {
    if (!isError) return;
    toast.error('Não foi possível carregar os comentários da IA', {
      description: 'Tente novamente em alguns instantes.',
    });
  }, [isError]);

  const toggle = useCallback(() => {
    setVisible((prev) => {
      const next = !prev;
      writePreference(sheetId, next);
      return next;
    });
  }, [sheetId]);

  return {
    visible,
    toggle,
    loading: visible && isFetching,
    decisions: data?.decisions ?? null,
    spellNotes: data?.spellNotes ?? null,
  };
};
