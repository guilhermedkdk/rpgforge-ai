import { isOAuthProviderId, type OAuthProviderId } from './oauth';

/**
 * The avatars a profile can choose from.
 *
 * The list is a contract: the API validates what it stores against it, and the web maps each id to a
 * picture through a `Record<ProfileAvatarId, …>`, so a missing one is a compile error. The
 * `critters-` prefix is only where the art came from; the UI never names a style.
 */
export const PROFILE_AVATAR_IDS = [
  'critters-01',
  'critters-02',
  'critters-03',
  'critters-04',
  'critters-05',
  'critters-06',
  'critters-07',
  'critters-08',
  'critters-09',
  'critters-10',
  'critters-11',
  'critters-12',
] as const;

export type ProfileAvatarId = (typeof PROFILE_AVATAR_IDS)[number];

export const isProfileAvatarId = (value: unknown): value is ProfileAvatarId =>
  typeof value === 'string' && (PROFILE_AVATAR_IDS as readonly string[]).includes(value);

/** Marks an avatar choice as "the picture from this provider" rather than a gallery id. */
export const PROVIDER_AVATAR_PREFIX = 'provider:';

export const providerAvatarValue = (provider: OAuthProviderId): string =>
  `${PROVIDER_AVATAR_PREFIX}${provider}`;

/**
 * What a profile shows, resolved from the single `avatarId` column.
 *
 * One column holds the whole choice on purpose: a separate "source" flag beside a gallery id could
 * contradict it, and then something has to decide which one wins.
 */
export type AvatarChoice =
  | { kind: 'initials' }
  | { kind: 'gallery'; id: ProfileAvatarId }
  | { kind: 'provider'; provider: OAuthProviderId };

/** Anything unrecognised degrades to the initials rather than to an empty circle. */
export const parseAvatarChoice = (avatarId: string | null | undefined): AvatarChoice => {
  if (isProfileAvatarId(avatarId)) return { kind: 'gallery', id: avatarId };

  if (typeof avatarId === 'string' && avatarId.startsWith(PROVIDER_AVATAR_PREFIX)) {
    const provider = avatarId.slice(PROVIDER_AVATAR_PREFIX.length);
    if (isOAuthProviderId(provider)) return { kind: 'provider', provider };
  }

  return { kind: 'initials' };
};

/**
 * The picture a choice resolves to, or null for a gallery pick or the initials.
 *
 * Also null when the chosen provider is not in the list, which is what makes an unlinked provider
 * degrade to the initials instead of to a broken image.
 */
export const resolveAvatarUrl = (
  avatarId: string | null | undefined,
  pictures: readonly { provider: OAuthProviderId; avatarUrl: string | null }[]
): string | null => {
  const choice = parseAvatarChoice(avatarId);
  if (choice.kind !== 'provider') return null;

  return pictures.find((entry) => entry.provider === choice.provider)?.avatarUrl ?? null;
};
