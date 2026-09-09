import type { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { getAccessTokenExpiresIn, getRefreshTokenExpiresIn } from './auth.config';

/**
 * `sameSite: 'lax'` is a deployment contract: the browser sends these cookies only to the site that
 * set them, so the API must answer on the SAME site as the web app. That holds because the web
 * proxies `/api/*` from its own origin (`next.config.ts` rewrites), and it must keep holding.
 *
 * A cross-site API host silently stops the browser sending the pair, so auth works on localhost and
 * fails in production with nothing in the logs. That deployment needs `sameSite: 'none'` with
 * `secure`, and HTTPS on both ends.
 */
const BASE_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
};

/**
 * The session cookie pair.
 *
 * Every way of signing in ends here: password, refresh and the OAuth callback all hand the browser
 * the same two httpOnly cookies, so there is exactly one session mechanism to reason about.
 */
export const setAuthCookies = (
  response: Response,
  configService: ConfigService,
  accessToken: string,
  refreshToken: string
): void => {
  response.cookie('accessToken', accessToken, {
    ...BASE_COOKIE_OPTIONS,
    maxAge: getAccessTokenExpiresIn(configService) * 1000,
  });
  response.cookie('refreshToken', refreshToken, {
    ...BASE_COOKIE_OPTIONS,
    maxAge: getRefreshTokenExpiresIn(configService) * 1000,
  });
};

export const clearAuthCookies = (response: Response): void => {
  response.clearCookie('accessToken', { path: '/' });
  response.clearCookie('refreshToken', { path: '/' });
};
