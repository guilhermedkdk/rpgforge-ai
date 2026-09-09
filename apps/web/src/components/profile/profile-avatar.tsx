'use client';

import { isProfileAvatarId } from '@rpgforce-ai/shared';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { profileAvatarSvg } from './profile-avatars';

/** The two letters shown when nobody picked an avatar. */
export const profileInitials = (name: string): string =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] ?? '')
    .join('')
    .toUpperCase() || '?';

interface ProfileAvatarProps {
  avatarId: string | null | undefined;
  /** Picture inherited from a linked provider. Used only when no gallery avatar was picked. */
  avatarUrl?: string | null;
  /** What the initials come from: the display name, or the handle. */
  name: string;
  className?: string;
  /** Text size for the initials fallback; the picture ignores it. */
  fallbackClassName?: string;
}

/**
 * A profile's picture: the chosen avatar, the one inherited from a provider, or the initials.
 *
 * A gallery pick outranks the provider's picture because it is a deliberate choice and the other is
 * only what the provider happened to have. The id is validated here rather than trusted, so a value
 * left over from a gallery that changed degrades instead of leaving an empty circle.
 */
export const ProfileAvatar = ({
  avatarId,
  avatarUrl,
  name,
  className,
  fallbackClassName,
}: ProfileAvatarProps) => {
  const picture = isProfileAvatarId(avatarId) ? profileAvatarSvg(avatarId) : null;

  // Names the branch actually rendered below. Not `avatarId ?? avatarUrl`: the settings form holds
  // "no gallery pick" as an EMPTY STRING, which `??` would keep, leaving the key unchanged exactly
  // when the picture disappears.
  const source = picture ? `id:${avatarId}` : avatarUrl ? `url:${avatarUrl}` : 'initials';

  const fallback = (
    <AvatarFallback
      className={cn('bg-secondary font-semibold text-secondary-foreground', fallbackClassName)}
    >
      {profileInitials(name)}
    </AvatarFallback>
  );

  return (
    // Keyed on the source: Radix keeps `imageLoadingStatus` on the Avatar root and never resets it
    // when the image unmounts, so dropping a picture (unlinking a provider) would leave the root
    // stuck on "loaded" and the fallback hidden, i.e. an empty circle until a reload. Remounting on
    // a source change is what clears it.
    <Avatar key={source} className={cn('bg-secondary', className)}>
      {picture ??
        (avatarUrl ? (
          <>
            {/* Plain img, not next/image: routing a 40px provider avatar through the optimizer
                would proxy someone else's CDN through ours for nothing. no-referrer because
                Google's avatar host answers 403 to a referred request. */}
            <AvatarImage src={avatarUrl} alt="" referrerPolicy="no-referrer" />
            {fallback}
          </>
        ) : (
          fallback
        ))}
    </Avatar>
  );
};
