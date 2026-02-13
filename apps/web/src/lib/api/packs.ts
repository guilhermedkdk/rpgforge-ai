import apiClient from './client';
import type { PackResponse } from '@rpgforce-ai/shared';

export const packsApi = {
  getAll: async (): Promise<PackResponse[]> => {
    const response = await apiClient.get<PackResponse[]>('/packs');
    return response.data;
  },

  getByIdOrSlug: async (idOrSlug: string): Promise<PackResponse> => {
    const response = await apiClient.get<PackResponse>(`/packs/${idOrSlug}`);
    return response.data;
  },
};
