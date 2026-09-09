'use client';

import { useEffect, useState } from 'react';
import { isAxiosError } from 'axios';
import { Link2 } from 'lucide-react';
import { toast } from 'sonner';
import { OAUTH_PROVIDER_LABELS } from '@rpgforce-ai/shared';
import type { OAuthProviderId, User } from '@rpgforce-ai/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useOAuthProviders } from '@/components/auth/oauth-buttons';
import { ProviderMark } from '@/components/auth/provider-marks';
import { useAuth } from '@/contexts/auth-context';
import { oauthApi } from '@/lib/api/auth';

/**
 * The accounts this profile can sign in with.
 *
 * Unlinking the last way in is refused by the API, not just hidden here, but the button still
 * explains itself: someone who only ever used Google has to create a password first, and being told
 * that up front beats a rejected click.
 */
export const ConnectionsCard = () => {
  const { user, refreshUser } = useAuth();
  const { data: providers } = useOAuthProviders();
  const [pending, setPending] = useState<OAuthProviderId | null>(null);

  // The callback bounces back here with a reason when linking failed at the provider.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('error') !== 'already_linked') return;

    toast.error('Essa conta já está vinculada a outro usuário.');
    window.history.replaceState(null, '', window.location.pathname + window.location.hash);
  }, []);

  if (!user || !providers?.length) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-serif">
          <Link2 className="h-4 w-4 text-primary" aria-hidden="true" />
          Contas conectadas
        </CardTitle>
        <CardDescription>Entre no RPGForge com um clique, sem digitar senha.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {providers.map((provider) => (
          <ConnectionRow
            key={provider}
            provider={provider}
            user={user}
            isPending={pending === provider}
            onPendingChange={setPending}
            onChanged={refreshUser}
          />
        ))}
      </CardContent>
    </Card>
  );
};

interface ConnectionRowProps {
  provider: OAuthProviderId;
  user: User;
  isPending: boolean;
  onPendingChange: (provider: OAuthProviderId | null) => void;
  onChanged: () => Promise<void>;
}

const ConnectionRow = ({
  provider,
  user,
  isPending,
  onPendingChange,
  onChanged,
}: ConnectionRowProps) => {
  const connection = user.connections.find((entry) => entry.provider === provider);

  // Removing the only provider from an account with no password would lock its owner out for good.
  const isOnlyWayIn = !user.hasPassword && user.connections.length <= 1;

  const handleUnlink = async () => {
    onPendingChange(provider);
    try {
      await oauthApi.unlink(provider);
      await onChanged();
      toast.success(`${OAUTH_PROVIDER_LABELS[provider]} desvinculado.`);
    } catch (error) {
      toast.error(
        isAxiosError(error) && error.response?.status === 400
          ? 'Crie uma senha antes de desvincular.'
          : 'Não foi possível desvincular. Tente de novo.'
      );
    } finally {
      onPendingChange(null);
    }
  };

  // `aria-disabled` rather than `disabled`: a disabled button fires no pointer events, so a tooltip
  // explaining WHY it is off would never open. This keeps it hoverable and focusable, and assistive
  // tech still announces it as unavailable. `isPending` uses the real `disabled`, since a spinner
  // needs no explanation and the block is momentary.
  const unlinkButton = (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={isPending}
      aria-disabled={isOnlyWayIn || undefined}
      onClick={isOnlyWayIn ? undefined : handleUnlink}
      className={cn(isOnlyWayIn && 'cursor-not-allowed opacity-50')}
    >
      {isPending ? <Spinner size="sm" /> : 'Desvincular'}
    </Button>
  );

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
      <div className="flex min-w-0 items-center gap-3">
        <ProviderMark provider={provider} />
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">{OAUTH_PROVIDER_LABELS[provider]}</p>
          <p className="truncate text-xs text-muted-foreground">
            {connection ? (connection.email ?? 'Conectado') : 'Não conectado'}
          </p>
        </div>
      </div>

      {connection ? (
        isOnlyWayIn ? (
          <Tooltip>
            <TooltipTrigger asChild>{unlinkButton}</TooltipTrigger>
            <TooltipContent side="top" className="max-w-56">
              Esse é o seu único jeito de entrar. Crie uma senha antes de desvincular.
            </TooltipContent>
          </Tooltip>
        ) : (
          unlinkButton
        )
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => oauthApi.start(provider, { redirect: '/settings', intent: 'link' })}
        >
          Vincular
        </Button>
      )}
    </div>
  );
};
