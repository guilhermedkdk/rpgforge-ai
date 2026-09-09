'use client';

import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { withoutOAuthErrorParams } from '@/lib/auth-errors';
import { armProviderHandoff } from '@/lib/provider-handoff';
import { LoginForm } from './login-form';
import { RegisterForm } from './register-form';

interface SignInDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Runs after a successful sign-in, with the page still exactly where it was. */
  onAuthenticated: () => void;
  /** Why the dialog appeared, in the caller's words. */
  description?: string;
  /** A failed provider round trip that brought the person back here. */
  initialError?: string | null;
}

/**
 * Sign in without leaving the page. Opens on "Criar conta", since it is raised by an action someone
 * took before having an account.
 *
 * The provider buttons still leave the site, which no dialog prevents. `armProviderHandoff` is what
 * makes that safe: pressing one is the only moment the page's draft may be stored, and `redirectTo`
 * brings the trip back to this exact URL.
 */
export const SignInDialog = ({
  open,
  onOpenChange,
  onAuthenticated,
  description,
  initialError,
}: SignInDialogProps) => {
  const [mode, setMode] = useState<'register' | 'login'>('register');
  const [redirectTo, setRedirectTo] = useState<string | undefined>(undefined);

  // Read on open rather than during render: the server pass has no location to read.
  //
  // Minus any failure report still in the query. The gate strips it too, but that is a navigation and
  // lands a tick later, so reading the raw URL here photographs it dirty and a successful sign-in
  // would carry the old error back as the destination.
  useEffect(() => {
    if (!open) return;
    setRedirectTo(`${window.location.pathname}${withoutOAuthErrorParams(window.location.search)}`);
  }, [open]);

  // A dismissed dialog reopens on the pane it was raised with, not on whatever was last browsed.
  useEffect(() => {
    if (!open) setMode('register');
  }, [open]);

  const shared = {
    description,
    initialError,
    onAuthenticated,
    redirectTo,
    // The provider buttons are the ONLY exit that takes the page down with work still in it.
    onBeforeStart: armProviderHandoff,
    titleAs: DialogTitle,
    descriptionAs: DialogDescription,
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* The form is the whole dialog: the card already carries its own border and padding. */}
      <DialogContent className="max-w-md border-0 bg-transparent p-0 shadow-none">
        {mode === 'register' ? (
          <RegisterForm {...shared} onSwitchMode={() => setMode('login')} />
        ) : (
          <LoginForm {...shared} onSwitchMode={() => setMode('register')} />
        )}
      </DialogContent>
    </Dialog>
  );
};
