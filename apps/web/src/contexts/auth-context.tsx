'use client';

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import type { User } from '@rpgforce-ai/shared';
import { authApi } from '@/lib/api/auth';
import { isAuthFailure } from '@/lib/api/errors';
import { onSessionExpired } from '@/lib/api/session-events';

/**
 * Backoff for the session probe at boot, in milliseconds.
 *
 * The API is routinely not listening yet when the first page loads: a container that just started,
 * a dev server still compiling, a deploy rolling over. Those all answer with no status at all, and
 * giving up on the first one is what makes the app open signed out with a valid session in the
 * cookie jar. An outright 401 never gets here, so this only ever delays a genuinely broken API.
 */
const SESSION_PROBE_BACKOFF_MS = [300, 900, 2700];

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * How stale the session may be before regaining focus is worth a round trip.
 *
 * The check exists to notice a sign-out that happened somewhere else, which is rare and in no
 * hurry. Alt-tabbing is neither: without a floor, moving between two windows spent a request each
 * way, and each one whose access token had expired spent a token rotation with it.
 */
const SESSION_RECHECK_INTERVAL_MS = 60_000;

export interface SignInOptions {
  /**
   * Skip the post-sign-in navigation.
   *
   * The sign-in dialog exists precisely so the page does not move: navigating away would throw out
   * the character draft the dialog was opened to protect.
   */
  stayOnPage?: boolean;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string, options?: SignInOptions) => Promise<void>;
  register: (email: string, password: string, options?: SignInOptions) => Promise<void>;
  logout: () => Promise<void>;
  /** Re-reads the session after the profile changes, so the header updates in place. */
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const lastSessionCheckRef = useRef(0);
  const router = useRouter();
  useEffect(() => {
    let cancelled = false;

    const loadUser = async () => {
      for (let attempt = 0; ; attempt++) {
        try {
          const { user } = await authApi.me();
          if (!cancelled) {
            // The focus re-check measures from here too: the boot probe IS a session check, and
            // without this an alt-tab right after loading spends a second identical request.
            lastSessionCheckRef.current = Date.now();
            setUser(user);
            setIsLoading(false);
          }
          return;
        } catch (error) {
          if (cancelled) return;

          if (isAuthFailure(error) || attempt === SESSION_PROBE_BACKOFF_MS.length) {
            setUser(null);
            setIsLoading(false);
            return;
          }

          await delay(SESSION_PROBE_BACKOFF_MS[attempt]);
        }
      }
    };

    loadUser();

    return () => {
      cancelled = true;
    };
  }, []);

  // The API client reports an expired session rather than navigating, so the decision lands here:
  // dropping the user is enough, and each route then does its own thing (a guarded page redirects,
  // a page holding a draft raises the sign-in dialog over it).
  useEffect(() => onSessionExpired(() => setUser(null)), []);

  // Re-checked when the tab regains focus, which is how a logout on another tab or device shows up
  // here. An expired access token needs nothing: the interceptor refreshes it on the way.
  //
  // Only a 401 drops the user. Coming back to a laptop whose wifi has not reconnected yet is the
  // ordinary case for this listener, and it must not be read as a sign-out.
  useEffect(() => {
    if (!user) return;

    const checkSession = async () => {
      lastSessionCheckRef.current = Date.now();
      try {
        const { user: currentUser } = await authApi.me();
        setUser(currentUser);
      } catch (error) {
        if (isAuthFailure(error)) setUser(null);
      }
    };
    const handleFocus = () => {
      if (Date.now() - lastSessionCheckRef.current < SESSION_RECHECK_INTERVAL_MS) return;
      checkSession();
    };
    window.addEventListener('focus', handleFocus);

    return () => {
      window.removeEventListener('focus', handleFocus);
    };
  }, [user]);

  const goToRedirect = () => {
    const params = new URLSearchParams(window.location.search);
    router.push(params.get('redirect') || '/sheets');
  };

  const login = async (email: string, password: string, options?: SignInOptions) => {
    const { user } = await authApi.login({ email, password });
    setUser(user);
    if (options?.stayOnPage) return;
    goToRedirect();
  };

  const register = async (email: string, password: string, options?: SignInOptions) => {
    const { user } = await authApi.register({ email, password });
    setUser(user);
    if (options?.stayOnPage) return;
    goToRedirect();
  };

  const refreshUser = async () => {
    lastSessionCheckRef.current = Date.now();
    try {
      const { user: currentUser } = await authApi.me();
      setUser(currentUser);
    } catch (error) {
      // A failed profile re-read is not evidence of a signed-out user, and blanking the header over
      // one would be a worse lie than showing the profile a second stale.
      if (isAuthFailure(error)) setUser(null);
    }
  };

  const logout = async () => {
    try {
      await authApi.logout();
    } catch (error) {
      console.error('Logout error:', error);
    }
    setUser(null);
    router.push('/auth/login');
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};

/** Redirects to /auth/login if unauthenticated; page renders its own Header, gating only content on `ready`. */
export const useRequireAuth = () => {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (isLoading) return;
    if (!user) router.replace(`/auth/login?redirect=${encodeURIComponent(pathname)}`);
  }, [user, isLoading, router, pathname]);

  return { ready: !isLoading && !!user, isLoading };
};
