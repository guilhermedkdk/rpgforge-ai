'use client';

import { useCallback, useRef, useState } from 'react';
import { isAxiosError } from 'axios';
import { generationApi } from '@/lib/api/generation';
import { AI_BUDGET_EXHAUSTED } from '@rpgforce-ai/shared';
import type {
  GenerationAnswer,
  GenerateQuestionsResponse,
  GenerateCharacterResponse,
} from '@rpgforce-ai/shared';

const isUnauthorized = (e: unknown): boolean => isAxiosError(e) && e.response?.status === 401;

const apiCode = (e: unknown): string =>
  isAxiosError(e)
    ? String((e.response?.data as { message?: unknown } | undefined)?.message ?? '')
    : '';

// The API's `message` is dev-facing (and in English): messages are chosen here, by status
function errorMessage(e: unknown, fallback: string): string {
  const status = isAxiosError(e) ? e.response?.status : undefined;

  if (status === 429) {
    return 'Muitas gerações em pouco tempo. Aguarde alguns minutos e tente de novo.';
  }

  // 503 is the deployment's own limit, not the person's pace, so it must not say "tente de novo":
  // the budget one stays closed until someone raises it.
  if (status === 503) {
    return apiCode(e) === AI_BUDGET_EXHAUSTED
      ? 'A criação com IA está temporariamente fora do ar. Você ainda pode montar a ficha manualmente.'
      : 'A IA está indisponível neste momento. Tente de novo em alguns minutos.';
  }

  return fallback;
}

interface UseAiGenerationOptions {
  /**
   * Called instead of setting `error` when the API refuses for lack of a session, so the caller can
   * raise the sign-in dialog and replay the call rather than leaving a dead-end sentence on screen.
   */
  onUnauthorized?: () => void;
}

/** Manual-mutation hook (loading/error state) for the two AI generation calls, mirroring useSaveSheet. */
export function useAiGeneration({ onUnauthorized }: UseAiGenerationOptions = {}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const onUnauthorizedRef = useRef(onUnauthorized);
  onUnauthorizedRef.current = onUnauthorized;

  const fetchQuestions = useCallback(
    async (params: {
      packId: string;
      prompt: string;
    }): Promise<GenerateQuestionsResponse | null> => {
      setLoading(true);
      setError(null);
      try {
        return await generationApi.getQuestions(params);
      } catch (e) {
        if (isUnauthorized(e) && onUnauthorizedRef.current) {
          onUnauthorizedRef.current();
          return null;
        }
        setError(errorMessage(e, 'Não foi possível gerar as perguntas. Tente novamente.'));
        return null;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const generate = useCallback(
    async (params: {
      packId: string;
      prompt: string;
      answers: GenerationAnswer[];
      generationId?: string;
    }): Promise<GenerateCharacterResponse | null> => {
      setLoading(true);
      setError(null);
      try {
        return await generationApi.generateCharacter(params);
      } catch (e) {
        if (isUnauthorized(e) && onUnauthorizedRef.current) {
          onUnauthorizedRef.current();
          return null;
        }
        setError(errorMessage(e, 'Não foi possível gerar a ficha. Tente novamente.'));
        return null;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return { loading, error, setError, fetchQuestions, generate };
}
