'use client';

import { UserRound } from 'lucide-react';
import type { PublicSheetSummary } from '@rpgforce-ai/shared';
import { FavoriteButton } from '@/components/sheets/favorite-button';
import { SheetListCard } from '@/components/sheets/sheet-list-card';
import { publicSheetPath } from '@/lib/public-sheet-path';

/**
 * The explore feed's card: the SAME card as "Minhas Fichas", pointed at the public URL and showing
 * the author where the owner's list shows the last edit. On a feed of strangers' characters, who
 * made it is the useful half; when it was last saved is the owner's business.
 */
export const PublicSheetCard = ({
  sheet,
  packName,
  packSlug,
}: {
  sheet: PublicSheetSummary;
  packName: string | null;
  packSlug: string | null;
}) => (
  <SheetListCard
    sheet={sheet}
    packName={packName}
    packSlug={packSlug}
    href={publicSheetPath(sheet.owner.username, sheet.id)}
    action={
      <FavoriteButton
        sheetId={sheet.id}
        isFavorited={sheet.isFavorited}
        favoriteCount={sheet.favoriteCount}
      />
    }
    footerRight={
      <span className="flex min-w-0 shrink items-center gap-1 text-xs text-muted-foreground">
        <UserRound className="h-3 w-3 shrink-0" aria-hidden="true" />
        <span className="truncate">
          {sheet.owner.displayName?.trim() || `@${sheet.owner.username}`}
        </span>
      </span>
    }
  />
);
