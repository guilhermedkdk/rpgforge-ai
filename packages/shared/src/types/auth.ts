import type { CharacterSheetSummary, PublicSheetSummary } from './character-sheet';
import type { OAuthConnection } from './oauth';

/** Rate-limit tier as much as a permission level: ADMIN accounts skip every limit. */
export type UserRole = 'USER' | 'ADMIN';

export interface User {
  id: string;
  email: string;
  createdAt: string;
  role: UserRole;
  /** Public handle; the profile lives at /u/{username}. */
  username: string;
  /** Optional friendly name shown instead of the handle. */
  displayName: string | null;
  /** The raw avatar choice; parse it with `parseAvatarChoice`. Null means the initials. */
  avatarId: string | null;
  /** The chosen provider's picture, already resolved by the API. Null for gallery or initials. */
  avatarUrl: string | null;
  /**
   * False for an account that only ever signed in with a provider. The settings page reads it to
   * offer "create a password" instead of "change password", and to ask for the handle rather than a
   * password before deleting the account.
   */
  hasPassword: boolean;
  /** Providers linked to this account. Drives the connected-accounts card. */
  connections: OAuthConnection[];
}

/** A profile page: the same shape for the owner and for a visitor, with the private parts nulled. */
export interface PublicProfileResponse {
  username: string;
  displayName: string | null;
  /** ISO date the account was created. */
  memberSince: string;
  /** True when the viewer is looking at their own profile. */
  isSelf: boolean;
  /** Only ever filled for the owner: an email is never public. */
  email: string | null;
  /** The raw avatar choice; parse it with `parseAvatarChoice`. Null means the initials. */
  avatarId: string | null;
  /** The chosen provider's picture, already resolved by the API. Null for gallery or initials. */
  avatarUrl: string | null;
  sheetCount: number;
  /** The owner's sheets; for a visitor, only what was published. */
  sheets: CharacterSheetSummary[];
  /**
   * Sheets this person bookmarked, newest first. Only ever filled for the OWNER: what someone reads
   * is their business, and every entry is a link to another account's character.
   */
  favorites: PublicSheetSummary[];
}

export interface AuthResponse {
  user: User;
}

export interface RegisterRequest {
  email: string;
  password: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface ForgotPasswordRequest {
  email: string;
}

/** What `POST /auth/password/forgot` answers, whatever the address turns out to be. */
export interface ForgotPasswordResponse {
  message: string;
}

/** The token comes from the link in the e-mail; it is the only credential the route asks for. */
export interface ResetPasswordRequest {
  token: string;
  newPassword: string;
}
