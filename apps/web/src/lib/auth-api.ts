import apiClient from './api-client';
import type {
  AuthResponse,
  RegisterRequest,
  LoginRequest,
  RefreshTokenRequest,
  TokensResponse,
} from '@rpgforce-ai/shared';

export const authApi = {
  register: async (data: RegisterRequest): Promise<AuthResponse> => {
    const response = await apiClient.post<AuthResponse>('/auth/register', data);
    return response.data;
  },

  login: async (data: LoginRequest): Promise<AuthResponse> => {
    const response = await apiClient.post<AuthResponse>('/auth/login', data);
    return response.data;
  },

  refreshToken: async (
    data: RefreshTokenRequest,
  ): Promise<TokensResponse> => {
    const response = await apiClient.post<TokensResponse>(
      '/auth/refresh',
      data,
    );
    return response.data;
  },

  logout: async (refreshToken: string): Promise<void> => {
    await apiClient.post('/auth/logout', { refreshToken });
  },
};
