import * as client from 'openid-client';
import type { OAuthProviderCredentials } from '../oauth.config';
import type {
  OAuthAuthorizationRequest,
  OAuthProfile,
  OAuthProviderAdapter,
} from './oauth-provider';

const DISCORD_ISSUER = new URL('https://discord.com');

const CURRENT_USER_URL = new URL('https://discord.com/api/users/@me');

/**
 * Discord's own scopes, NOT `openid`.
 *
 * Discord publishes an OIDC discovery document but its API reference documents neither the `openid`
 * scope nor an ID token, so building on one would rest on undocumented behaviour. `identify` plus
 * `email` is the supported path, and it answers at `/users/@me`.
 */
const SCOPE = 'identify email';

/** The subset of Discord's user object this needs. `verified` is its name for "email verified". */
interface DiscordUser {
  id: string;
  username: string;
  global_name?: string | null;
  avatar?: string | null;
  email?: string | null;
  verified?: boolean;
}

/** `a_`-prefixed hashes are animated, and only those are served as GIF. */
const avatarUrl = (user: DiscordUser): string | null => {
  if (!user.avatar) return null;

  const extension = user.avatar.startsWith('a_') ? 'gif' : 'png';
  return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${extension}?size=128`;
};

/**
 * Discord as a plain OAuth 2 provider.
 *
 * The contrast with Google is the whole reason the adapter exists: there is no ID token to validate,
 * so the identity is read from `/users/@me` with the access token that was just obtained. PKCE and
 * `state` still carry the security of the round trip; a nonce would have nothing to protect here,
 * so none is issued.
 */
export class DiscordOAuthProvider implements OAuthProviderAdapter {
  readonly id = 'discord' as const;

  private configuration: Promise<client.Configuration> | null = null;

  constructor(private readonly credentials: OAuthProviderCredentials) {}

  private getConfiguration(): Promise<client.Configuration> {
    if (!this.configuration) {
      this.configuration = client
        .discovery(DISCORD_ISSUER, this.credentials.clientId, this.credentials.clientSecret)
        .catch((error: unknown) => {
          this.configuration = null;
          throw error;
        });
    }
    return this.configuration;
  }

  async createAuthorizationRequest(callbackUrl: string): Promise<OAuthAuthorizationRequest> {
    const configuration = await this.getConfiguration();

    const codeVerifier = client.randomPKCECodeVerifier();
    const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);
    const state = client.randomState();

    const url = client.buildAuthorizationUrl(configuration, {
      redirect_uri: callbackUrl,
      scope: SCOPE,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      state,
      // Without this Discord silently reuses the last authorization, so someone signed into the
      // wrong Discord account can never pick another one.
      prompt: 'consent',
    });

    return { url: url.href, state, codeVerifier };
  }

  async exchangeCode(input: {
    callbackUrl: string;
    currentUrl: URL;
    state: string;
    codeVerifier: string;
  }): Promise<OAuthProfile> {
    const configuration = await this.getConfiguration();

    const tokens = await client.authorizationCodeGrant(configuration, input.currentUrl, {
      pkceCodeVerifier: input.codeVerifier,
      expectedState: input.state,
    });

    const response = await client.fetchProtectedResource(
      configuration,
      tokens.access_token,
      CURRENT_USER_URL,
      'GET'
    );

    if (!response.ok) {
      throw new Error(`Discord rejected the user lookup with ${response.status}`);
    }

    const user = (await response.json()) as DiscordUser;

    if (!user.id) throw new Error('Discord returned no user id');
    if (!user.email) throw new Error('Discord returned no email');

    return {
      providerAccountId: user.id,
      email: user.email.toLowerCase(),
      emailVerified: user.verified === true,
      // `global_name` is the display name; `username` is the handle, and the only one always set.
      name: user.global_name?.trim() || user.username.trim() || null,
      picture: avatarUrl(user),
    };
  }
}
