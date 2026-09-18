'use client';

import {
  OAUTH_PROVIDER_LABELS,
  PROFILE_AVATAR_IDS,
  providerAvatarValue,
  type OAuthConnection,
} from '@rpgforce-ai/shared';
import { UserRound } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { profileAvatarSvg } from './profile-avatars';

interface AvatarPickerProps {
  /** The raw avatar choice. Empty string means the initials. */
  value: string;
  /** Linked providers, so each one that has a picture becomes an option. */
  connections?: OAuthConnection[];
  onChange: (avatarId: string) => void;
  disabled?: boolean;
}

/**
 * The avatar gallery, plus whatever the linked providers offer.
 *
 * A fixed set of pictures rather than an upload: choosing from a shelf needs no storage, no
 * resizing and no moderation. The provider photos sit in the same row because to the person
 * choosing they are the same kind of thing: a face to use.
 */
export const AvatarPicker = ({
  value,
  connections = [],
  onChange,
  disabled = false,
}: AvatarPickerProps) => {
  const withPicture = connections.filter((connection) => connection.avatarUrl);

  return (
    <div className="flex flex-wrap gap-2">
      {/* "No picture" belongs beside the pictures, not in a separate control to go looking for. */}
      <Tile
        selected={value === ''}
        disabled={disabled}
        label="Usar minhas iniciais"
        onClick={() => onChange('')}
      >
        <UserRound className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
      </Tile>

      {withPicture.map((connection) => {
        const choice = providerAvatarValue(connection.provider);
        return (
          <Tile
            key={connection.provider}
            selected={value === choice}
            disabled={disabled}
            label={`Usar a foto do ${OAUTH_PROVIDER_LABELS[connection.provider]}`}
            onClick={() => onChange(choice)}
          >
            {/* Plain img, not next/image, for the reason spelled out in ProfileAvatar. */}
            <img
              src={connection.avatarUrl ?? ''}
              alt=""
              referrerPolicy="no-referrer"
              className="h-full w-full object-cover"
            />
          </Tile>
        );
      })}

      {PROFILE_AVATAR_IDS.map((id, index) => (
        <Tile
          key={id}
          selected={value === id}
          disabled={disabled}
          label={`Avatar ${index + 1}`}
          onClick={() => onChange(id)}
        >
          {profileAvatarSvg(id)}
        </Tile>
      ))}
    </div>
  );
};

const Tile = ({
  selected,
  disabled,
  label,
  onClick,
  children,
}: {
  selected: boolean;
  disabled: boolean;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) => (
  // The project's tooltip rather than the native `title`: same delay and styling as everywhere else,
  // and the two together would stack a second, slower bubble on top of the first.
  <Tooltip>
    <TooltipTrigger asChild>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-pressed={selected}
        aria-label={label}
        className={cn(
          'flex h-12 w-12 cursor-pointer items-center justify-center overflow-hidden rounded-full bg-secondary transition-[box-shadow]',
          // The ring is the selection: a border would resize the tile and shift the whole row.
          selected
            ? 'ring-2 ring-primary ring-offset-2 ring-offset-card'
            : 'ring-1 ring-border hover:ring-primary/40',
          disabled && 'cursor-not-allowed opacity-50'
        )}
      >
        {children}
      </button>
    </TooltipTrigger>
    <TooltipContent side="top">{label}</TooltipContent>
  </Tooltip>
);
