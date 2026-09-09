// Type-only, and erased at compile time: `auth.ts` importing back from here costs no runtime cycle.
import type { User } from './auth';

/**
 * Identity providers a user can sign in with.
 *
 * The list is a contract: the API validates a route parameter against it, and the web app maps each
 * id to its button. Adding one means an entry here, an adapter on the API and a brand mark on the
 * web, in that order.
 */
export const OAUTH_PROVIDER_IDS = ['google', 'discord'] as const;

export type OAuthProviderId = (typeof OAUTH_PROVIDER_IDS)[number];

export const isOAuthProviderId = (value: unknown): value is OAuthProviderId =>
  typeof value === 'string' && (OAUTH_PROVIDER_IDS as readonly string[]).includes(value);

/** How each provider is named to a person. Lives here because the API writes copy about it too. */
export const OAUTH_PROVIDER_LABELS: Record<OAuthProviderId, string> = {
  google: 'Google',
  discord: 'Discord',
};

/** A provider linked to an account, as shown in the connected-accounts card. */
export interface OAuthConnection {
  provider: OAuthProviderId;
  /**
   * The address at the provider when the link was made, so the card can say WHICH Google account is
   * connected. Never used to find the user: only `providerAccountId` is stable.
   */
  email: string | null;
  /** This provider's picture, so the avatar picker can offer it as an option. */
  avatarUrl: string | null;
  /** ISO date the link was made. */
  linkedAt: string;
}

/**
 * Why a callback bounced back to the web app, as the `?error=` on `/auth/login`.
 *
 * The reasons are coarse on purpose: a visitor who is not signed in learns nothing from them about
 * whether an account exists.
 */
export const OAUTH_ERROR_CODES = [
  'access_denied',
  'invalid_state',
  'email_unverified',
  'provider_error',
  'already_linked',
  'use_linked_provider',
] as const;

export type OAuthErrorCode = (typeof OAUTH_ERROR_CODES)[number];

export const isOAuthErrorCode = (value: unknown): value is OAuthErrorCode =>
  typeof value === 'string' && (OAUTH_ERROR_CODES as readonly string[]).includes(value);

/**
 * The identity waiting to be linked, from `GET /auth/oauth/pending-link`.
 *
 * It exists so the confirmation screen can name the account. The verified provider identity itself
 * stays in a signed httpOnly cookie the callback set, never in a URL or in the page.
 */
export interface PendingOAuthLink {
  provider: OAuthProviderId;
  email: string;
}

/** Confirms a pending link. Only the password: the provider identity comes from the cookie. */
export interface ConfirmOAuthLinkRequest {
  password: string;
}

/** What `POST /auth/oauth/link` answers: the session, plus where the caller wanted to land. */
export interface ConfirmOAuthLinkResponse {
  user: User;
  redirect: string;
}

/** Providers this deployment has credentials for, from `GET /auth/oauth/providers`. */
export interface OAuthProvidersResponse {
  providers: OAuthProviderId[];
}
