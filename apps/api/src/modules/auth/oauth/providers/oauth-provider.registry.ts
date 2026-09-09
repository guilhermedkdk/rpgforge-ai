import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAUTH_PROVIDER_IDS, type OAuthProviderId } from '@rpgforce-ai/shared';
import { readProviderCredentials, type OAuthProviderCredentials } from '../oauth.config';
import { DiscordOAuthProvider } from './discord.provider';
import { GoogleOAuthProvider } from './google.provider';
import type { OAuthProviderAdapter } from './oauth-provider';

type AdapterFactory = (credentials: OAuthProviderCredentials) => OAuthProviderAdapter;

// Adding a provider is an entry here plus its adapter. Nothing else in the module names a provider.
const FACTORIES: Record<OAuthProviderId, AdapterFactory> = {
  google: (credentials) => new GoogleOAuthProvider(credentials),
  discord: (credentials) => new DiscordOAuthProvider(credentials),
};

/**
 * The providers this deployment can actually use.
 *
 * A provider with no credentials in the environment is simply absent rather than an error: a
 * checkout without a Google app still boots, and the web app hides the button instead of offering
 * one that would fail.
 */
@Injectable()
export class OAuthProviderRegistry {
  private readonly logger = new Logger(OAuthProviderRegistry.name);
  private readonly adapters = new Map<OAuthProviderId, OAuthProviderAdapter>();

  constructor(configService: ConfigService) {
    for (const id of OAUTH_PROVIDER_IDS) {
      const credentials = readProviderCredentials(configService, id);
      if (!credentials) continue;
      this.adapters.set(id, FACTORIES[id](credentials));
    }

    const enabled = this.enabledProviders();
    this.logger.log(
      enabled.length > 0
        ? `OAuth providers enabled: ${enabled.join(', ')}`
        : 'No OAuth provider configured; social sign-in is off'
    );
  }

  enabledProviders(): OAuthProviderId[] {
    return [...this.adapters.keys()];
  }

  get(provider: OAuthProviderId): OAuthProviderAdapter | null {
    return this.adapters.get(provider) ?? null;
  }
}
