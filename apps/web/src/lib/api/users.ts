import apiClient from './client';
import type { PublicProfileResponse } from '@rpgforce-ai/shared';

export const usersApi = {
  /** A profile. Public: the owner's own request also brings their sheets and email back. */
  getProfile: async (username: string): Promise<PublicProfileResponse> => {
    const response = await apiClient.get<PublicProfileResponse>(
      `/users/${encodeURIComponent(username)}`
    );
    return response.data;
  },

  updateProfile: async (changes: {
    displayName?: string;
    username?: string;
    /** Empty string clears it, back to the initials. */
    avatarId?: string;
  }): Promise<{ username: string; displayName: string | null; avatarId: string | null }> => {
    const response = await apiClient.patch('/users/me', changes);
    return response.data;
  },

  /** Omit `currentPassword` for an account that has none: it signs in through a provider. */
  changePassword: async (
    currentPassword: string | undefined,
    newPassword: string
  ): Promise<void> => {
    await apiClient.post('/users/me/password', {
      ...(currentPassword ? { currentPassword } : {}),
      newPassword,
    });
  },

  /** The password confirms it, or the handle does when the account has no password. */
  deleteAccount: async (confirmation: {
    password?: string;
    confirmUsername?: string;
  }): Promise<void> => {
    await apiClient.delete('/users/me', { data: confirmation });
  },
};
