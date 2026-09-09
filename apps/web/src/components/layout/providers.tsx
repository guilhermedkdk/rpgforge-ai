'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { queryClient } from '@/lib/query-client';
import { AuthProvider } from '@/contexts/auth-context';
import { AuthGateProvider } from '@/contexts/auth-gate';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ThemeProvider } from './theme-provider';

/** The project's tooltip timing, in one place. */
const TOOLTIP_DELAY_MS = 300;

export const Providers = ({ children }: { children: React.ReactNode }) => {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem
      storageKey="rpgforge-theme"
      disableTransitionOnChange
    >
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <TooltipProvider delayDuration={TOOLTIP_DELAY_MS} skipDelayDuration={0}>
            <AuthGateProvider>{children}</AuthGateProvider>
          </TooltipProvider>
          <Toaster richColors position="bottom-right" closeButton />
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
};
