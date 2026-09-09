import type { OAuthProviderId } from '@rpgforce-ai/shared';

/** The identity a provider vouches for, once its ID token has been validated. */
export interface OAuthProfile {
  /** The provider's stable subject. The only field safe to identify an account by. */
  providerAccountId: string;
  email: string;
  /** Whether the PROVIDER verified the address. A false here must stop the sign-in. */
  emailVerified: boolean;
  name: string | null;
  picture: string | null;
}

/** What the start of a flow needs to hand back: where to send the browser, and what to remember. */
export interface OAuthAuthorizationRequest {
  url: string;
  state: string;
  /** Only for providers that issue an ID token; it is that token's replay defence, nothing else. */
  nonce?: string;
  codeVerifier: string;
}

/**
 * One identity provider.
 *
 * Adding a provider means implementing this and registering it, so nothing outside the adapter has
 * to know whether the provider speaks OIDC, plain OAuth 2, or something of its own.
 */
export interface OAuthProviderAdapter {
  readonly id: OAuthProviderId;

  /** Builds the consent-screen URL along with the per-request secrets the callback will check. */
  createAuthorizationRequest(callbackUrl: string): Promise<OAuthAuthorizationRequest>;

  /**
   * Validates the callback and returns the profile.
   *
   * Implementations must reject a response whose state does not match, and must prove the identity
   * they return: an OIDC provider by validating the ID token's signature, issuer, audience, expiry
   * and nonce; a plain OAuth 2 provider by reading it from an endpoint the access token unlocks.
   * Throwing is the only allowed failure.
   */
  exchangeCode(input: {
    callbackUrl: string;
    currentUrl: URL;
    state: string;
    nonce?: string;
    codeVerifier: string;
  }): Promise<OAuthProfile>;
}
