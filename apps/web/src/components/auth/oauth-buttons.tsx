'use client';

import { useQuery } from '@tanstack/react-query';
import { OAUTH_PROVIDER_LABELS } from '@rpgforce-ai/shared';
import type { OAuthProviderId } from '@rpgforce-ai/shared';
import { Button } from '@/components/ui/button';
import { oauthApi } from '@/lib/api/auth';
import { ProviderMark } from './provider-marks';

/**
 * Which providers this deployment offers.
 *
 * Asked once and cached for the session: the answer comes from the API's environment and cannot
 * change while the tab is open.
 */
export const useOAuthProviders = () =>
  useQuery({
    queryKey: ['oauth-providers'],
    queryFn: oauthApi.providers,
    staleTime: Infinity,
    // A deployment with no provider configured is a normal answer, not a failure worth retrying.
    retry: false,
  });

interface OAuthButtonsProps {
  /** Where to land after signing in. Carried through the provider round trip. */
  redirect?: string;
  /** Verb the label starts with, so the register page does not say "Entrar". */
  action?: 'entrar' | 'cadastrar';
  disabled?: boolean;
  /** Last call before the browser leaves for the provider. The dialog uses it to hand off its draft. */
  onBeforeStart?: () => void;
}

/**
 * The provider buttons plus their separator.
 *
 * Renders nothing at all when no provider is configured, so a checkout without Google credentials
 * shows a plain e-mail form rather than a button that leads to a 404.
 */
export const OAuthButtons = ({
  redirect,
  action = 'entrar',
  disabled,
  onBeforeStart,
}: OAuthButtonsProps) => {
  const { data: providers } = useOAuthProviders();

  if (!providers?.length) return null;

  const handleStart = (provider: OAuthProviderId) => {
    onBeforeStart?.();
    oauthApi.start(provider, redirect ? { redirect } : undefined);
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {providers.map((provider) => (
          <Button
            key={provider}
            type="button"
            variant="outline"
            className="w-full"
            disabled={disabled}
            onClick={() => handleStart(provider)}
          >
            <ProviderMark provider={provider} />
            {action === 'entrar' ? 'Entrar com ' : 'Cadastrar com '}
            {OAUTH_PROVIDER_LABELS[provider]}
          </Button>
        ))}
      </div>

      {/* A rule with the word sitting in it, rather than a line and a caption on separate rows. */}
      <div className="flex items-center gap-3" aria-hidden="true">
        <span className="h-px flex-1 bg-border" />
        <span className="text-xs uppercase tracking-wide text-muted-foreground">ou</span>
        <span className="h-px flex-1 bg-border" />
      </div>
    </div>
  );
};
