import { Prisma, type OAuthProvider } from '@prisma/client';
import type { OAuthConnection, User } from '@rpgforce-ai/shared';
import { resolveAvatarUrl } from '@rpgforce-ai/shared';
import { toProviderId } from './oauth/provider-enum';

/**
 * Everything a session response needs, in one place.
 *
 * It deliberately pulls `password` even though the hash never leaves the API: `hasPassword` is
 * derived from it, and `toSessionUser` is the only thing allowed to read the field. Selecting it
 * here and dropping it there keeps that decision in one file instead of four call sites.
 */
export const USER_SESSION_SELECT = {
  id: true,
  email: true,
  createdAt: true,
  role: true,
  username: true,
  displayName: true,
  avatarId: true,
  password: true,
  oauthAccounts: {
    select: { provider: true, email: true, avatarUrl: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  },
} satisfies Prisma.UserSelect;

export type UserSessionRow = Prisma.UserGetPayload<{ select: typeof USER_SESSION_SELECT }>;

/** Prisma rows to the wire shape the shared avatar resolver and the settings card both read. */
export const toConnections = (
  accounts: {
    provider: OAuthProvider;
    email?: string | null;
    avatarUrl: string | null;
    createdAt?: Date;
  }[]
): OAuthConnection[] =>
  accounts.map((account) => ({
    provider: toProviderId(account.provider),
    email: account.email ?? null,
    avatarUrl: account.avatarUrl,
    linkedAt: (account.createdAt ?? new Date(0)).toISOString(),
  }));

/** Maps a row to the wire shape. The password hash stops here and never reaches a response. */
export const toSessionUser = (row: UserSessionRow): User => {
  const connections = toConnections(row.oauthAccounts);

  return {
    id: row.id,
    email: row.email,
    createdAt: row.createdAt.toISOString(),
    role: row.role,
    username: row.username,
    displayName: row.displayName,
    avatarId: row.avatarId,
    avatarUrl: resolveAvatarUrl(row.avatarId, connections),
    hasPassword: row.password !== null,
    connections,
  };
};
