import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { notifySessionExpired } from './session-events';

const getApiBaseUrl = () => {
  if (typeof window !== 'undefined') return '/api';
  return process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4001';
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
    // Only a refused refresh ends the session. Anything else means the API did not answer, and the
    // caller retries rather than tearing a working session down over a blip.
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      notifySessionExpired();
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
