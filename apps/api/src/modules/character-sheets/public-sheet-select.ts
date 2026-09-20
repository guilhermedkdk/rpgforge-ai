import type { OAuthProvider } from '@prisma/client';
import { resolveAvatarUrl, type SheetOwner } from '@rpgforce-ai/shared';
import { toConnections } from '../auth/user-session';

/**
 * The author fields every published-sheet payload carries. The provider pictures come along because
 * an avatar choice of `provider:<id>` resolves to one of them; the resolution happens here so no
 * consumer has to receive someone else's linked accounts to draw a 40px circle.
 */
export const SHEET_OWNER_SELECT = {
  username: true,
  displayName: true,
  avatarId: true,
  oauthAccounts: { select: { provider: true, avatarUrl: true } },
} as const;

export interface SheetOwnerRow {
  username: string;
  displayName: string | null;
  avatarId: string | null;
  oauthAccounts: { provider: OAuthProvider; avatarUrl: string | null }[];
}

export const toSheetOwner = (user: SheetOwnerRow): SheetOwner => ({
  username: user.username,
  displayName: user.displayName,
  avatarId: user.avatarId,
  avatarUrl: resolveAvatarUrl(user.avatarId, toConnections(user.oauthAccounts)),
});

/** Columns a sheet row needs to become a `PublicSheetSummary`. */
export const PUBLIC_SHEET_SELECT = {
  id: true,
  packId: true,
  name: true,
  schemaVersion: true,
  isPublic: true,
  publishedAt: true,
  createdAt: true,
  updatedAt: true,
  data: true,
  user: { select: SHEET_OWNER_SELECT },
} as const;
