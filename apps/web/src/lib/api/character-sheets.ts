import apiClient from './client';
import type {
  CharacterSheetResponse,
  CharacterSheetSummary,
  CharacterSheetWithRulesResponse,
  PublicSheetSummary,
  SheetAiNotesResponse,
} from '@rpgforce-ai/shared';

/** What a favourite toggle answers: the sheet's new state and its new count. */
interface FavoriteResult {
  id: string;
  isFavorited: boolean;
  favoriteCount: number;
}

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

  /**
   * Kept out of `getByIdWithRules` on purpose: the notes are only rendered when the reader asks for
   * them, so a sheet's load must not carry them.
   */
  getAiNotes: async (id: string): Promise<SheetAiNotesResponse> => {
    const response = await apiClient.get<SheetAiNotesResponse>(
      `/character-sheets/${encodeURIComponent(id)}/ai-notes`
    );
    return response.data;
  },

  /**
   * The PDF is rendered server-side by a headless browser over this same sheet page, so the file is
   * the sheet itself. `theme` is what the reader is looking at, so the file matches it; the filename
   * comes from the response, which is where the name is slugified.
   */
  exportPdf: async (
    id: string,
    theme: 'light' | 'dark' = 'light'
  ): Promise<{ blob: Blob; fileName: string }> => {
    const response = await apiClient.post<Blob>(
      `/character-sheets/${encodeURIComponent(id)}/export/pdf`,
      { theme },
      { responseType: 'blob' }
    );
    const disposition = String(response.headers['content-disposition'] ?? '');
    const match = disposition.match(/filename="?([^"]+)"?/i);
    return { blob: response.data, fileName: match?.[1] ?? 'ficha.pdf' };
  },

  create: async (
    packId: string,
    data: Record<string, unknown>,
    // AI drafts only: links the saved sheet to the wizard interaction that produced it.
    generationId?: string
  ): Promise<CharacterSheetResponse> => {
    const response = await apiClient.post<CharacterSheetResponse>('/character-sheets', {
      packId,
      data,
      ...(generationId ? { generationId } : {}),
    });
    return response.data;
  },

  update: async (id: string, data: Record<string, unknown>): Promise<CharacterSheetResponse> => {
    const response = await apiClient.patch<CharacterSheetResponse>(
      `/character-sheets/${encodeURIComponent(id)}`,
      { data }
    );
    return response.data;
  },

  /** Publishing never touches `data`, so it can't trip the save validation on an incomplete sheet. */
  setVisibility: async (
    id: string,
    isPublic: boolean
  ): Promise<{ id: string; isPublic: boolean; publishedAt: string | null }> => {
    const response = await apiClient.patch(
      `/character-sheets/${encodeURIComponent(id)}/visibility`,
      { isPublic }
    );
    return response.data;
  },

  /** Bookmarking is idempotent, so the button never has to guard against a double click. */
  favorite: async (id: string): Promise<FavoriteResult> => {
    const response = await apiClient.put<FavoriteResult>(
      `/character-sheets/${encodeURIComponent(id)}/favorite`
    );
    return response.data;
  },

  unfavorite: async (id: string): Promise<FavoriteResult> => {
    const response = await apiClient.delete<FavoriteResult>(
      `/character-sheets/${encodeURIComponent(id)}/favorite`
    );
    return response.data;
  },

  listFavorites: async (): Promise<PublicSheetSummary[]> => {
    const response = await apiClient.get<PublicSheetSummary[]>('/character-sheets/favorites');
    return response.data;
  },

  remove: async (id: string): Promise<void> => {
    await apiClient.delete(`/character-sheets/${encodeURIComponent(id)}`);
  },
};
