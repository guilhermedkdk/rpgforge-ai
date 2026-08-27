import apiClient from './client';
import type {
  GenerateQuestionsRequest,
  GenerateQuestionsResponse,
  GenerateCharacterRequest,
  GenerateCharacterResponse,
} from '@rpgforce-ai/shared';

export const generationApi = {
  getQuestions: async (req: GenerateQuestionsRequest): Promise<GenerateQuestionsResponse> => {
    const response = await apiClient.post<GenerateQuestionsResponse>('/generation/questions', req);
    return response.data;
  },

  generateCharacter: async (req: GenerateCharacterRequest): Promise<GenerateCharacterResponse> => {
    const response = await apiClient.post<GenerateCharacterResponse>('/generation/character', req);
    return response.data;
  },
};
