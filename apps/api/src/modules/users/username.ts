/**
 * The public handle. It is the profile's URL (/u/{username}), so it has to be short, lowercase and
 * URL-safe; the email never appears in public.
 */
export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 20;

/** Lowercase letters, digits and single dashes, never leading or trailing. */
export const USERNAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** A first suggestion from the email's local part; uniqueness is resolved by the caller. */
export function usernameFromEmail(email: string): string {
  const localPart = email.split('@')[0] ?? '';
  return normalizeUsername(localPart) || 'jogador';
}

/** Same normalisation the pattern accepts, so a suggestion never lands invalid. */
export function normalizeUsername(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, USERNAME_MAX_LENGTH)
    .replace(/-+$/, '');
}

/** The nth candidate for a taken handle: `elias`, `elias-2`, `elias-3`… */
export function usernameCandidate(base: string, attempt: number): string {
  if (attempt === 0) return base;
  const suffix = `-${attempt + 1}`;
  return `${base.slice(0, USERNAME_MAX_LENGTH - suffix.length).replace(/-+$/, '')}${suffix}`;
}
