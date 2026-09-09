import { createHash } from 'node:crypto';

/**
 * How long a rotated refresh token keeps working.
 *
 * Rotation and multiple tabs are in direct conflict: every tab holds its own refresh mutex, so when
 * the access token expires they all present the SAME cookie at once and only the first would
 * survive a strict "one use" rule. The window is what lets the losers through. It is measured from
 * the FIRST use, never extended by a later one, so a stolen token cannot be kept alive by replaying
 * it: after this many seconds the token is proof of theft, not of a race.
 */
export const ROTATION_GRACE_SECONDS = 60;

/** The stored form of a refresh token. Lookups hash the incoming token and compare. */
export const hashRefreshToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');

/** Whether a token already rotated at `usedAt` is still inside the window a racing tab needs. */
export const isWithinRotationGrace = (usedAt: Date, now: Date = new Date()): boolean =>
  now.getTime() - usedAt.getTime() <= ROTATION_GRACE_SECONDS * 1000;
