'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { AuthCard } from '@/components/auth/auth-card';
import { OAUTH_PROVIDER_LABELS } from '@rpgforce-ai/shared';
import { ProviderMark } from '@/components/auth/provider-marks';
import { useAuth } from '@/contexts/auth-context';
import { oauthApi } from '@/lib/api/auth';

/** Whether the screen is asking for the old password or handing out a new one. */
type Mode = 'confirm' | 'recover';

const MIN_PASSWORD_LENGTH = 8;

/**
 * Confirms linking a provider to an account that already has a password.
 *
 * The password is the point of the screen. This app does not verify e-mail addresses at
 * registration, so an account could have been created with someone else's address before they ever
 * signed up: linking on a matching address alone would hand that account to the provider identity.
 *
 * `recover` mode is the exit for someone who no longer has that password. It accepts the provider's
 * own verification of the address in place of it, which is the same proof a reset link by e-mail
 * carries, and replaces the password rather than keeping it.
 */
export const LinkAccountForm = () => {
  const [mode, setMode] = useState<Mode>('confirm');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { refreshUser } = useAuth();

  const {
    data: pending,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['oauth-pending-link'],
    queryFn: oauthApi.pendingLink,
    retry: false,
  });

  useEffect(() => {
    if (isError) setError('A vinculação expirou. Comece de novo.');
  }, [isError]);

  const switchTo = (next: Mode) => {
    setMode(next);
    setError(null);
    setPassword('');
    setNewPassword('');
    setConfirmPassword('');
  };

  const handleFailure = (caught: unknown, expired: string) => {
    const status = isAxiosError(caught) ? caught.response?.status : undefined;
    setError(status === 401 ? expired : 'Não foi possível concluir. Tente de novo.');
    setIsSubmitting(false);
  };

  const finish = async (redirect: string) => {
    // The cookies are already set; this only refills the context so the header updates in place.
    await refreshUser();
    router.push(redirect);
  };

  const handleConfirm = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const { redirect } = await oauthApi.confirmLink(password);
      await finish(redirect);
    } catch (caught) {
      handleFailure(caught, 'Senha incorreta ou vinculação expirada.');
    }
  };

  const handleRecover = async (event: React.FormEvent) => {
    event.preventDefault();

    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setError('A senha precisa ter pelo menos 8 caracteres.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('As senhas não são iguais.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const { redirect } = await oauthApi.resetPasswordThroughProvider(newPassword);
      await finish(redirect);
    } catch (caught) {
      handleFailure(caught, 'A vinculação expirou. Comece de novo.');
    }
  };

  if (isLoading) {
    return (
      <AuthCard title="Vincular conta" description="Verificando...">
        <div className="flex justify-center py-4">
          <Spinner />
        </div>
      </AuthCard>
    );
  }

  if (!pending) {
    return (
      <AuthCard
        title="Vincular conta"
        description="Não há nenhuma vinculação pendente"
        error={error}
      >
        <Button asChild className="w-full">
          <Link href="/auth/login">Voltar para o login</Link>
        </Button>
      </AuthCard>
    );
  }

  const providerLabel = OAUTH_PROVIDER_LABELS[pending.provider];

  const identity = (explanation: string) => (
    <div className="mb-4 rounded-lg border border-border bg-muted/40 p-3 text-sm">
      <div className="flex items-center gap-2 font-medium text-foreground">
        <ProviderMark provider={pending.provider} />
        {pending.email}
      </div>
      <p className="mt-1.5 text-muted-foreground">{explanation}</p>
    </div>
  );

  if (mode === 'recover') {
    return (
      <AuthCard
        title="Definir nova senha"
        description="Sua conta volta a ser sua agora"
        error={error}
      >
        {identity(
          `O ${providerLabel} confirmou que esse email é seu, então você pode escolher uma nova senha sem precisar da antiga. A senha anterior deixa de funcionar.`
        )}

        <form onSubmit={handleRecover} noValidate className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="recover-password">Nova senha</Label>
            <Input
              id="recover-password"
              type="password"
              value={newPassword}
              autoFocus
              autoComplete="new-password"
              onChange={(event) => {
                setNewPassword(event.target.value);
                if (error) setError(null);
              }}
              disabled={isSubmitting}
              aria-invalid={error ? 'true' : 'false'}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="recover-password-confirm">Repita a senha</Label>
            <Input
              id="recover-password-confirm"
              type="password"
              value={confirmPassword}
              autoComplete="new-password"
              onChange={(event) => {
                setConfirmPassword(event.target.value);
                if (error) setError(null);
              }}
              disabled={isSubmitting}
              aria-invalid={error ? 'true' : 'false'}
            />
          </div>

          <Button
            type="submit"
            disabled={isSubmitting || !newPassword || !confirmPassword}
            className="w-full"
          >
            {isSubmitting ? <Spinner size="sm" /> : 'Salvar e entrar'}
          </Button>

          <div className="text-center text-sm">
            <button
              type="button"
              onClick={() => switchTo('confirm')}
              className="cursor-pointer text-muted-foreground hover:underline"
            >
              Lembrei minha senha
            </button>
          </div>
        </form>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Vincular conta" description="Confirme sua senha para concluir" error={error}>
      {identity(
        `Já existe uma conta do RPGForge com esse email. Digite a senha dela para vincular o ${providerLabel} e entrar.`
      )}

      <form onSubmit={handleConfirm} noValidate className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="link-password">Senha do RPGForge</Label>
          <Input
            id="link-password"
            type="password"
            value={password}
            autoFocus
            autoComplete="current-password"
            onChange={(event) => {
              setPassword(event.target.value);
              if (error) setError(null);
            }}
            disabled={isSubmitting}
            aria-invalid={error ? 'true' : 'false'}
          />
        </div>

        <Button type="submit" disabled={isSubmitting || !password} className="w-full">
          {isSubmitting ? <Spinner size="sm" /> : 'Vincular e entrar'}
        </Button>

        <div className="flex flex-col items-center gap-1.5 text-sm">
          <button
            type="button"
            onClick={() => switchTo('recover')}
            className="cursor-pointer font-medium text-primary-ink hover:underline"
          >
            Esqueci minha senha
          </button>
          <Link href="/auth/login" className="text-muted-foreground hover:underline">
            Entrar de outro jeito
          </Link>
        </div>
      </form>
    </AuthCard>
  );
};
