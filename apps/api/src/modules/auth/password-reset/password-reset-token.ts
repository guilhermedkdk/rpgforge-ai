import { createHash, randomBytes } from 'node:crypto';

/** Long enough to go and find the e-mail, short enough that an old inbox is not a way in. */
export const RESET_TOKEN_TTL_SECONDS = 30 * 60;

/** The stored form of a reset token. Lookups hash the incoming token and compare. */
export const hashResetToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');

/** Url-safe, because the token travels in a link the user clicks. */
export const createResetToken = (): string => randomBytes(32).toString('base64url');
