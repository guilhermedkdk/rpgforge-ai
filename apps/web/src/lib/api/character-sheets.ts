import apiClient from './client';
import type { CharacterSheetResponse, CharacterSheetSummary, CharacterSheetWithRulesResponse } from '@rpgforce-ai/shared';

export const characterSheetsApi = {
  list: async (): Promise<CharacterSheetSummary[]> => {
    const response = await apiClient.get<CharacterSheetSummary[]>('/character-sheets');
    return response.data;
  },

  getById: async (id: string): Promise<CharacterSheetResponse> => {
    const response = await apiClient.get<CharacterSheetResponse>(
      `/character-sheets/${encodeURIComponent(id)}`
    );
    return response.data;
  },

  getByIdWithRules: async (id: string): Promise<CharacterSheetWithRulesResponse> => {
    const response = await apiClient.get<CharacterSheetWithRulesResponse>(
      `/character-sheets/${encodeURIComponent(id)}/with-rules`
    );
    return response.data;
  },

  create: async (
    packId: string,
    data: Record<string, unknown>
  ): Promise<CharacterSheetResponse> => {
    const response = await apiClient.post<CharacterSheetResponse>('/character-sheets', {
      packId,
      data,
    });
    return response.data;
  },

  update: async (
    id: string,
    data: Record<string, unknown>
  ): Promise<CharacterSheetResponse> => {
    const response = await apiClient.patch<CharacterSheetResponse>(
      `/character-sheets/${encodeURIComponent(id)}`,
      { data }
    );
    return response.data;
  },
};
