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

/**
 * Confirms linking a provider to an account that already has a password.
 *
 * The password is the point of the screen. This app does not verify e-mail addresses at
 * registration, so an account could have been created with someone else's address before they ever
 * signed up: linking on a matching address alone would hand that account to the provider identity.
 */
export const LinkAccountForm = () => {
  const [password, setPassword] = useState('');
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

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const { redirect } = await oauthApi.confirmLink(password);
      // The cookies are already set; this only refills the context so the header updates in place.
      await refreshUser();
      router.push(redirect);
    } catch (caught) {
      const status = isAxiosError(caught) ? caught.response?.status : undefined;
      setError(
        status === 401
          ? 'Senha incorreta ou vinculação expirada.'
          : 'Não foi possível vincular. Tente de novo.'
      );
      setIsSubmitting(false);
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

  return (
    <AuthCard title="Vincular conta" description="Confirme sua senha para concluir" error={error}>
      <div className="mb-4 rounded-lg border border-border bg-muted/40 p-3 text-sm">
        <div className="flex items-center gap-2 font-medium text-foreground">
          <ProviderMark provider={pending.provider} />
          {pending.email}
        </div>
        <p className="mt-1.5 text-muted-foreground">
          Já existe uma conta do RPGForge com esse email. Digite a senha dela para vincular o{' '}
          {OAUTH_PROVIDER_LABELS[pending.provider]} e entrar.
        </p>
      </div>

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
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

        <div className="text-center text-sm">
          <Link href="/auth/login" className="text-muted-foreground hover:underline">
            Entrar de outro jeito
          </Link>
        </div>
      </form>
    </AuthCard>
  );
};
