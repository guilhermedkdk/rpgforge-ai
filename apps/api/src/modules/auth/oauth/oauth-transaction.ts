import type { CookieOptions, Request, Response } from 'express';
import type { JwtService } from '@nestjs/jwt';
import type { OAuthProviderId } from '@rpgforce-ai/shared';

/** What the browser is in the middle of doing when it leaves for the provider. */
export type OAuthIntent = 'login' | 'link';

/**
 * The leg of the flow that happens while the browser is away at the provider.
 *
 * It rides in a signed httpOnly cookie rather than in server memory so the API stays stateless and
 * survives a restart, or a second instance, between the redirect out and the callback back.
 */
export interface OAuthTransaction {
  provider: OAuthProviderId;
  intent: OAuthIntent;
  /** CSRF: echoed by the provider and compared on the way back. */
  state: string;
  /** Replay defence: must come back inside the ID token. Absent for a provider that issues none. */
  nonce?: string;
  /** PKCE: proves the callback comes from whoever started the flow. */
  codeVerifier: string;
  /** Where to land on SUCCESS. Already validated to be a path on this site. */
  redirect: string;
  /**
   * Where to report a FAILURE: the page that drew the provider button.
   *
   * Deliberately not `redirect`. Success means "carry on to where you were going"; failure means
   * "go back and read this", and those are different places. Sending a failure to `redirect` would
   * usually mean a protected page, which bounces to the login screen and drops the message on the
   * way.
   */
  origin: string;
  /** For `intent: 'link'`, the account the link is being added to. */
  userId?: string;
}

/** The verified provider identity, held while the user proves they own the local account. */
export interface OAuthPendingLink {
  provider: OAuthProviderId;
  providerAccountId: string;
  email: string;
  name: string | null;
  picture: string | null;
  /** Where to land once the link is confirmed. */
  redirect: string;
}

export const OAUTH_TRANSACTION_COOKIE = 'oauth_tx';
export const OAUTH_PENDING_LINK_COOKIE = 'oauth_link';

/** Long enough to read a consent screen, short enough that a stolen cookie is worth little. */
const TRANSACTION_TTL_SECONDS = 600;
/** Long enough to type a password once. */
const PENDING_LINK_TTL_SECONDS = 600;

// sameSite 'lax' is load-bearing, not a default: 'strict' would withhold the cookie on the
// top-level redirect BACK from the provider, and the callback would look like a forged request.
const cookieOptions = (maxAgeSeconds: number): CookieOptions => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/',
  maxAge: maxAgeSeconds * 1000,
});

/**
 * Only a path on this site, never an absolute URL.
 *
 * `//evil.com` is the case worth naming: the browser reads it as protocol-relative, so a plain
 * "starts with /" check would turn the callback into an open redirect.
 */
export const safeRedirectPath = (value: unknown, fallback: string): string => {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//'))
    return fallback;
  if (value.includes('\\')) return fallback;
  return value;
};

export const writeTransaction = (
  response: Response,
  jwtService: JwtService,
  secret: string,
  transaction: OAuthTransaction
): void => {
  const token = jwtService.sign(transaction, { secret, expiresIn: TRANSACTION_TTL_SECONDS });
  response.cookie(OAUTH_TRANSACTION_COOKIE, token, cookieOptions(TRANSACTION_TTL_SECONDS));
};

export const readTransaction = (
  request: Request,
  jwtService: JwtService,
  secret: string
): OAuthTransaction | null => {
  const token = request?.cookies?.[OAUTH_TRANSACTION_COOKIE];
  if (!token) return null;

  try {
    return jwtService.verify<OAuthTransaction>(token, { secret });
  } catch {
    return null;
  }
};

export const clearTransaction = (response: Response): void => {
  response.clearCookie(OAUTH_TRANSACTION_COOKIE, { path: '/' });
};

export const writePendingLink = (
  response: Response,
  jwtService: JwtService,
  secret: string,
  pending: OAuthPendingLink
): void => {
  const token = jwtService.sign(pending, { secret, expiresIn: PENDING_LINK_TTL_SECONDS });
  response.cookie(OAUTH_PENDING_LINK_COOKIE, token, cookieOptions(PENDING_LINK_TTL_SECONDS));
};

export const readPendingLink = (
  request: Request,
  jwtService: JwtService,
  secret: string
): OAuthPendingLink | null => {
  const token = request?.cookies?.[OAUTH_PENDING_LINK_COOKIE];
  if (!token) return null;

  try {
    return jwtService.verify<OAuthPendingLink>(token, { secret });
  } catch {
    return null;
  }
};

export const clearPendingLink = (response: Response): void => {
  response.clearCookie(OAUTH_PENDING_LINK_COOKIE, { path: '/' });
};
