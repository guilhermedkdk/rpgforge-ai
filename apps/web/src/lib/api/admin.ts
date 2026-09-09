import apiClient from './client';
import type { AdminOverviewResponse, AdminUserSort, AdminUsersResponse } from '@rpgforce-ai/shared';

export const adminApi = {
  /**
   * `tzOffsetMinutes` is the browser's own offset, so the daily series is bucketed by the reader's
   * calendar day instead of UTC (which put a bar on "tomorrow" every evening).
   */
  overview: async (days: number): Promise<AdminOverviewResponse> => {
    const response = await apiClient.get<AdminOverviewResponse>('/admin/overview', {
      params: { days, tzOffsetMinutes: new Date().getTimezoneOffset() },
    });
    return response.data;
  },

  users: async (params: {
    limit?: number;
    offset?: number;
    sort?: AdminUserSort;
  }): Promise<AdminUsersResponse> => {
    const response = await apiClient.get<AdminUsersResponse>('/admin/users', { params });
    return response.data;
  },
};
