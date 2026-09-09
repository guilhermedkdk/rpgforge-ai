import apiClient, { API_BASE_URL } from './client';
import type {
  AuthResponse,
  RegisterRequest,
  LoginRequest,
  ConfirmOAuthLinkResponse,
  OAuthProviderId,
  OAuthProvidersResponse,
  PendingOAuthLink,
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

  refresh: async (): Promise<AuthResponse> => {
    const response = await apiClient.post<AuthResponse>('/auth/refresh');
    return response.data;
  },

  me: async (): Promise<AuthResponse> => {
    const response = await apiClient.get<AuthResponse>('/auth/me');
    return response.data;
  },

  logout: async (): Promise<void> => {
    await apiClient.post('/auth/logout');
  },
};

export const oauthApi = {
  /** Which providers this deployment can offer. An empty list means no button is drawn. */
  providers: async (): Promise<OAuthProviderId[]> => {
    const response = await apiClient.get<OAuthProvidersResponse>('/auth/oauth/providers');
    return response.data.providers;
  },

  /**
   * Leaves the app for the provider's consent screen.
   *
   * A full navigation, not fetch: the whole point is a top-level redirect the provider can bounce
   * back, and an XHR could neither follow it nor receive the cookies the callback sets.
   */
  start: (provider: OAuthProviderId, options?: { redirect?: string; intent?: 'link' }): void => {
    const params = new URLSearchParams();
    if (options?.redirect) params.set('redirect', options.redirect);
    if (options?.intent) params.set('intent', options.intent);
    // Where a failure has to be reported back to. Read here rather than passed in: the flow always
    // starts on the page drawing the button, so no caller can get this wrong or forget it.
    params.set('from', window.location.pathname);

    const query = params.toString();
    window.location.href = `${API_BASE_URL}/auth/oauth/${provider}${query ? `?${query}` : ''}`;
  },

  /** The identity waiting to be linked, so the confirmation screen can name it. */
  pendingLink: async (): Promise<PendingOAuthLink> => {
    const response = await apiClient.get<PendingOAuthLink>('/auth/oauth/pending-link');
    return response.data;
  },

  confirmLink: async (password: string): Promise<ConfirmOAuthLinkResponse> => {
    const response = await apiClient.post<ConfirmOAuthLinkResponse>('/auth/oauth/link', {
      password,
    });
    return response.data;
  },

  unlink: async (provider: OAuthProviderId): Promise<void> => {
    await apiClient.delete(`/auth/oauth/${provider}`);
  },
};
