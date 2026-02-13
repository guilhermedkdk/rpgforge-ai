'use client';

import { QueryClient } from '@tanstack/react-query';

const isClientError = (status: number): boolean => status >= 400 && status < 500;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000, // 1 minuto
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        const status = (error as { response?: { status?: number } })?.response?.status;
        if (status !== undefined && isClientError(status)) return false;
        return failureCount < 3;
      },
    },
  },
});