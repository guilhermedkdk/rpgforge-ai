import { createHmac } from 'node:crypto';
import type { ConfigService } from '@nestjs/config';
import type { OAuthProviderId } from '@rpgforce-ai/shared';

/** Credentials for one provider, read from the environment. */
export interface OAuthProviderCredentials {
  clientId: string;
  clientSecret: string;
}

const CREDENTIAL_ENV_KEYS: Record<OAuthProviderId, { id: string; secret: string }> = {
  google: { id: 'GOOGLE_CLIENT_ID', secret: 'GOOGLE_CLIENT_SECRET' },
  discord: { id: 'DISCORD_CLIENT_ID', secret: 'DISCORD_CLIENT_SECRET' },
};

/**
 * Credentials for a provider, or null when the environment has none.
 *
 * Null is a supported state, not an error: a checkout with no Google app configured must still boot,
 * and the web app hides the button instead of offering one that cannot work.
 */
export const readProviderCredentials = (
  configService: ConfigService,
  provider: OAuthProviderId
): OAuthProviderCredentials | null => {
  const keys = CREDENTIAL_ENV_KEYS[provider];
  const clientId = configService.get<string>(keys.id)?.trim();
  const clientSecret = configService.get<string>(keys.secret)?.trim();

  if (!clientId || !clientSecret) return null;

  return { clientId, clientSecret };
};

/**
 * Where the provider sends the browser back.
 *
 * It points at the WEB app, not at the API, because the web proxies `/api/*` here: routing the
 * callback through that proxy is what keeps the session cookies first-party on the web's origin.
 * Register this exact URL as the redirect URI in the provider's console.
 */
export const buildCallbackUrl = (
  configService: ConfigService,
  provider: OAuthProviderId
): string => {
  const base =
    configService.get<string>('OAUTH_CALLBACK_BASE_URL')?.trim() ||
    configService.get<string>('FRONTEND_URL')?.trim() ||
    'http://localhost:4000';

  return `${base.replace(/\/+$/, '')}/api/auth/oauth/${provider}/callback`;
};

/**
 * A signing key for the short-lived OAuth cookies, derived from `JWT_SECRET`.
 *
 * Derived rather than reused so an OAuth cookie can NEVER be replayed as an access token: the two
 * are signed under different keys, which makes the separation structural instead of a claim check
 * somebody has to remember to write.
 */
export const oauthCookieSecret = (configService: ConfigService, label: string): string => {
  const jwtSecret = configService.get<string>('JWT_SECRET');
  if (!jwtSecret) throw new Error('JWT_SECRET is required in .env');

  return createHmac('sha256', jwtSecret).update(`rpgforge:oauth:${label}:v1`).digest('base64url');
};
