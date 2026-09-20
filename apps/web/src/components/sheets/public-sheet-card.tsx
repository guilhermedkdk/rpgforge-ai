'use client';

import type { PublicSheetSummary } from '@rpgforce-ai/shared';
import { ProfileAvatar } from '@/components/profile/profile-avatar';
import { FavoriteButton } from './favorite-button';
import { SheetCard } from './sheet-card';
import { publicSheetPath } from '@/lib/public-sheet-path';
import { formatExactDate, formatRelativeDate } from '@/lib/relative-date';

interface PublicSheetCardProps {
  sheet: PublicSheetSummary;
  packName: string | null;
  packSlug: string | null;
  variant?: 'grid' | 'featured';
  /** Position in the "Em alta" strip, shown as a rank. */
  rank?: number;
}

/**
 * A published character on the explore feed: the sheet card with who wrote it, when, and how many
 * people saved it. The author is text, not a link: the whole card is already one.
 */
export const PublicSheetCard = ({
  sheet,
  packName,
  packSlug,
  variant = 'grid',
  rank,
}: PublicSheetCardProps) => {
  // The handle is shown with its `@`, but the avatar derives initials from the name, where a leading
  // `@` would be the only letter it finds.
  const displayName = sheet.owner.displayName?.trim();
  const authorLabel = displayName || `@${sheet.owner.username}`;
  const authorName = displayName || sheet.owner.username;

  return (
    <SheetCard
      sheet={sheet}
      packName={packName}
      packSlug={packSlug}
      href={publicSheetPath(sheet.owner.username, sheet.id)}
      variant={variant}
      badge={
        rank ? (
          <span className="shrink-0 font-serif text-sm font-bold text-primary-ink">#{rank}</span>
        ) : null
      }
      action={
        <FavoriteButton
          sheetId={sheet.id}
          isFavorited={sheet.isFavorited}
          favoriteCount={sheet.favoriteCount}
        />
      }
      footer={
        <>
          <ProfileAvatar
            avatarId={sheet.owner.avatarId}
            avatarUrl={sheet.owner.avatarUrl}
            name={authorName}
            className="size-6 shrink-0"
            fallbackClassName="text-[10px]"
          />
          <span className="min-w-0 flex-1 truncate text-foreground/80">{authorLabel}</span>
          <span className="shrink-0" title={`Publicada em ${formatExactDate(sheet.publishedAt)}`}>
            {formatRelativeDate(sheet.publishedAt)}
          </span>
        </>
      }
    />
  );
};
