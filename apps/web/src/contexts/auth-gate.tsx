'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { SignInDialog } from '@/components/auth/sign-in-dialog';
import { oauthErrorMessage, withoutOAuthErrorParams } from '@/lib/auth-errors';
import { useAuth } from './auth-context';

/** The routes that render the auth forms as a whole page and report their own failures. */
const AUTH_ROUTE_PREFIX = '/auth/';

interface RequireAuthOptions {
  /** Why the dialog appeared, shown in place of the generic auth copy. */
  reason?: string;
}

interface AuthGateContextType {
  /**
   * Runs `action` immediately when there is a session; otherwise raises the sign-in dialog and runs
   * it once the person is authenticated.
   */
  requireAuth: (action: () => void, options?: RequireAuthOptions) => void;
  /**
   * Raises the dialog even though the client believes it has a session.
   *
   * For the answer to a 401: the session expired while the page was open, so `requireAuth` would
   * cheerfully replay the same call into the same rejection.
   */
  promptSignIn: (action: () => void, options?: RequireAuthOptions) => void;
}

const AuthGateContext = createContext<AuthGateContextType | undefined>(undefined);

/**
 * Turns "you must be signed in" from a dead end into a detour.
 *
 * The old flow answered a 401 with a sentence and no button, so the only way forward was the header,
 * and that navigation is what destroyed an unsaved character. Here the action is held, the dialog is
 * raised over the page, and the action is replayed on the other side.
 */
export const AuthGateProvider = ({ children }: { children: React.ReactNode }) => {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string | undefined>(undefined);
  const [callbackError, setCallbackError] = useState<string | null>(null);
  const pendingRef = useRef<(() => void) | null>(null);

  // A failed provider round trip comes back to the page that started it. On an /auth page that page
  // shows the message itself; anywhere else the dialog is the only thing that can, so reopen it.
  //
  // Only for someone with no session: a SIGN-IN dialog has nothing to offer a signed-in user, and
  // `/settings` reports its own linking failures the same way, through `?error=already_linked`.
  // Without this it would be hijacked, query stripped, before its card ever read it.
  //
  // The query is stripped right away, and the message handed over in memory: leaving it in the URL
  // would make a reload replay an error the person already read, on a page whose draft is long gone.
  useEffect(() => {
    if (isLoading || user) return;
    if (pathname.startsWith(AUTH_ROUTE_PREFIX)) return;
    const params = new URLSearchParams(window.location.search);
    const message = oauthErrorMessage(params.get('error'), params.get('provider'));
    if (!message) return;

    setCallbackError(message);
    setOpen(true);

    router.replace(`${pathname}${withoutOAuthErrorParams(window.location.search)}`);
  }, [pathname, router, user, isLoading]);

  const promptSignIn = useCallback((action: () => void, options?: RequireAuthOptions) => {
    pendingRef.current = action;
    setReason(options?.reason);
    setCallbackError(null);
    setOpen(true);
  }, []);

  const requireAuth = useCallback(
    (action: () => void, options?: RequireAuthOptions) => {
      if (user) {
        action();
        return;
      }
      promptSignIn(action, options);
    },
    [user, promptSignIn]
  );

  // The ONE way the dialog closes. A second exit that forgot to reset would leave the last failure
  // in state, ready to be shown next to an unrelated reason the next time anything opens it.
  const closeDialog = useCallback(() => {
    setOpen(false);
    setCallbackError(null);
    setReason(undefined);
  }, []);

  const handleAuthenticated = useCallback(() => {
    closeDialog();
    const action = pendingRef.current;
    pendingRef.current = null;
    // The session cookie is already set by the time the sign-in promise resolves, so the replayed
    // call is authenticated without waiting for the context's user state to propagate.
    action?.();
  }, [closeDialog]);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (next) {
        setOpen(true);
        return;
      }
      // Dismissed without signing in: drop the action instead of firing it on the next unrelated one.
      pendingRef.current = null;
      closeDialog();
    },
    [closeDialog]
  );

  return (
    <AuthGateContext.Provider value={{ requireAuth, promptSignIn }}>
      {children}
      <SignInDialog
        open={open}
        onOpenChange={handleOpenChange}
        onAuthenticated={handleAuthenticated}
        description={reason}
        initialError={callbackError}
      />
    </AuthGateContext.Provider>
  );
};

export const useAuthGate = () => {
  const context = useContext(AuthGateContext);
  if (context === undefined) throw new Error('useAuthGate must be used within an AuthGateProvider');
  return context;
};
