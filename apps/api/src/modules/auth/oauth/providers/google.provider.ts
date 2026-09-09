import * as client from 'openid-client';
import type { OAuthProviderCredentials } from '../oauth.config';
import type {
  OAuthAuthorizationRequest,
  OAuthProfile,
  OAuthProviderAdapter,
} from './oauth-provider';

const GOOGLE_ISSUER = new URL('https://accounts.google.com');

/** `openid` for the ID token, the other two for the address and the display name plus picture. */
const SCOPE = 'openid email profile';

/** The ID token claims Google fills in for the scopes above. */
interface GoogleIdTokenClaims {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
}

/**
 * Google as an OpenID Connect provider.
 *
 * Everything security-critical about the callback (ID token signature against Google's JWKS, issuer,
 * audience, expiry, nonce, PKCE and state) is delegated to `openid-client`, a certified relying
 * party. Hand-rolling those checks is where implementations of this flow usually go wrong.
 */
export class GoogleOAuthProvider implements OAuthProviderAdapter {
  readonly id = 'google' as const;

  // Discovery is one network round trip; the result is immutable for the life of the process, so it
  // is fetched once and shared. The promise itself is cached so concurrent sign-ins do not race.
  private configuration: Promise<client.Configuration> | null = null;

  constructor(private readonly credentials: OAuthProviderCredentials) {}

  private getConfiguration(): Promise<client.Configuration> {
    if (!this.configuration) {
      this.configuration = client
        .discovery(GOOGLE_ISSUER, this.credentials.clientId, this.credentials.clientSecret)
        .catch((error: unknown) => {
          // Do not cache a failure: a DNS blip at boot would otherwise disable sign-in until restart.
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
    const nonce = client.randomNonce();

    const url = client.buildAuthorizationUrl(configuration, {
      redirect_uri: callbackUrl,
      scope: SCOPE,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      state,
      nonce,
      // Google only returns email_verified and the picture when it is asked for the profile scope;
      // 'select_account' stops it from silently reusing a session the person did not intend to use.
      prompt: 'select_account',
    });

    return { url: url.href, state, nonce, codeVerifier };
  }

  async exchangeCode(input: {
    callbackUrl: string;
    currentUrl: URL;
    state: string;
    nonce: string;
    codeVerifier: string;
  }): Promise<OAuthProfile> {
    const configuration = await this.getConfiguration();

    const tokens = await client.authorizationCodeGrant(configuration, input.currentUrl, {
      pkceCodeVerifier: input.codeVerifier,
      expectedState: input.state,
      expectedNonce: input.nonce,
      idTokenExpected: true,
    });

    const claims = tokens.claims() as GoogleIdTokenClaims | undefined;
    if (!claims?.sub) throw new Error('Google ID token carried no subject');
    if (!claims.email) throw new Error('Google ID token carried no email');

    return {
      providerAccountId: claims.sub,
      email: claims.email.toLowerCase(),
      emailVerified: claims.email_verified === true,
      name: claims.name?.trim() || null,
      picture: claims.picture?.trim() || null,
    };
  }
}
