import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { isProtectedRoute } from '@/lib/route-config';

const getApiBaseUrl = () => {
  if (typeof window !== 'undefined') return '/api';
  return process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
};

export const API_BASE_URL = getApiBaseUrl();

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
});

const isAuthEndpoint = (url: string | undefined): boolean => {
  if (!url) return false;
  const path = url.replace(API_BASE_URL, '').split('?')[0];
  return /\/auth\/(login|register|refresh)$/.test(path);
};

let isRefreshing = false;
let refreshPromise: Promise<void> | null = null;

const performRefresh = async (): Promise<void> => {
  try {
    await axios.post(
      `${API_BASE_URL}/auth/refresh`,
      {},
      {
        headers: { 'Content-Type': 'application/json' },
        withCredentials: true,
      }
    );
  } catch (error) {
    if (typeof window !== 'undefined') {
      const pathname = window.location.pathname;

      if (isProtectedRoute(pathname)) {
        window.location.href = '/auth/login';
      }
    }
    throw error;
  }
};

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };

    const shouldRefresh =
      error.response?.status === 401 &&
      !originalRequest._retry &&
      !isAuthEndpoint(originalRequest?.url);

    if (!shouldRefresh) {
      return Promise.reject(error);
    }

    originalRequest._retry = true;

    try {
      if (isRefreshing && refreshPromise) {
        await refreshPromise;
        return apiClient(originalRequest);
      }

      isRefreshing = true;
      refreshPromise = performRefresh();
      await refreshPromise;

      return apiClient(originalRequest);
    } catch (refreshError) {
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
      refreshPromise = null;
    }
  }
);

export default apiClient;
