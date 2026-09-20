'use client';

import { Globe, History, Lock } from 'lucide-react';
import type { CharacterSheetSummary } from '@rpgforce-ai/shared';
import { SheetCard } from './sheet-card';
import { formatExactDate, formatRelativeDate } from '@/lib/relative-date';

interface OwnedSheetCardProps {
  sheet: CharacterSheetSummary;
  packName: string | null;
  packSlug: string | null;
  /** Where the card leads. Defaults to the owner's editable sheet. */
  href?: string;
  /** Names the sheet's visibility in the band. Only for the owner: a visitor sees public ones only. */
  showVisibility?: boolean;
}

/** A character in its owner's hands: the sheet card with the last save and, for the owner, its visibility. */
export const OwnedSheetCard = ({
  sheet,
  packName,
  packSlug,
  href,
  showVisibility = false,
}: OwnedSheetCardProps) => (
  <SheetCard
    sheet={sheet}
    packName={packName}
    packSlug={packSlug}
    href={href ?? `/sheets/${encodeURIComponent(sheet.id)}`}
    badge={
      showVisibility ? (
        <span
          className="inline-flex shrink-0 items-center gap-1.5 text-3xs font-semibold uppercase tracking-widest text-muted-foreground"
          title={
            sheet.isPublic
              ? 'Publicada: qualquer pessoa pode ver esta ficha, e ela aparece na página Explorar.'
              : 'Só você vê esta ficha.'
          }
        >
          {sheet.isPublic ? (
            <Globe className="h-3 w-3 text-primary-ink" aria-hidden="true" />
          ) : (
            <Lock className="h-3 w-3" aria-hidden="true" />
          )}
          {sheet.isPublic ? 'Pública' : 'Privada'}
        </span>
      ) : null
    }
    footer={
      <>
        <History className="h-3 w-3 shrink-0" aria-hidden="true" />
        <span
          className="min-w-0 flex-1 truncate"
          title={`Atualizada em ${formatExactDate(sheet.updatedAt)}`}
        >
          Atualizada {formatRelativeDate(sheet.updatedAt)}
        </span>
      </>
    }
  />
);
