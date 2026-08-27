'use client';

import { useCallback, useState } from 'react';
import { isAxiosError } from 'axios';
import { generationApi } from '@/lib/api/generation';
import type {
  GenerationAnswer,
  GenerateQuestionsResponse,
  GenerateCharacterResponse,
} from '@rpgforce-ai/shared';

// The API's `message` is dev-facing (and in English): messages are chosen here, by status
function errorMessage(e: unknown, fallback: string): string {
  if (isAxiosError(e) && e.response?.status === 401) {
    return 'Faça login para usar a criação com IA.';
  }
  return fallback;
}

/** Manual-mutation hook (loading/error state) for the two AI generation calls, mirroring useSaveSheet. */
export function useAiGeneration() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchQuestions = useCallback(
    async (params: { packId: string; prompt: string }): Promise<GenerateQuestionsResponse | null> => {
      setLoading(true);
      setError(null);
      try {
        return await generationApi.getQuestions(params);
      } catch (e) {
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
