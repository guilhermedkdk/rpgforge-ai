import apiClient from './client';
import type {
  PublicSheetListResponse,
  PublicSheetSort,
  PublicSheetWithRulesResponse,
} from '@rpgforce-ai/shared';

/** Published sheets. Every route here is open: no token is sent and none is needed. */
export const publicSheetsApi = {
  list: async (params: {
    limit?: number;
    offset?: number;
    q?: string;
    packId?: string;
    sort?: PublicSheetSort;
  }): Promise<PublicSheetListResponse> => {
    const response = await apiClient.get<PublicSheetListResponse>('/public/sheets', { params });
    return response.data;
  },

  getByIdWithRules: async (id: string): Promise<PublicSheetWithRulesResponse> => {
    const response = await apiClient.get<PublicSheetWithRulesResponse>(
      `/public/sheets/${encodeURIComponent(id)}/with-rules`
    );
    return response.data;
  },
};
