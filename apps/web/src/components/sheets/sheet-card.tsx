'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import type { CharacterSheetSummary } from '@rpgforce-ai/shared';
import { SystemLabel } from '@/components/systems/system-label';
import { SheetArtTile } from './sheet-art-tile';
import { describeSheetPreview } from './sheet-preview-labels';
import { cn } from '@/lib/utils';

interface SheetCardProps {
  sheet: CharacterSheetSummary;
  packName: string | null;
  packSlug: string | null;
  href: string;
  /** Read-out at the band's right edge (visibility, a rank). Inside the link: never a control. */
  badge?: ReactNode;
  /**
   * Control pinned to the band's corner (the favourite toggle). Rendered as a SIBLING of the link,
   * not inside it: a button nested in an anchor is invalid.
   */
  action?: ReactNode;
  /** The card's last row: who wrote it, or when it was last saved. */
  footer: ReactNode;
  /** `featured` is the "Em alta" strip: the same card with room for bigger art. */
  variant?: 'grid' | 'featured';
}

/**
 * THE sheet card: one shape for the owner's list, the explore feed and a profile, so a character
 * looks the same wherever it is picked from. The whole card is the link; the band names the system.
 */
export const SheetCard = ({
  sheet,
  packName,
  packSlug,
  href,
  badge,
  action,
  footer,
  variant = 'grid',
}: SheetCardProps) => {
  const featured = variant === 'featured';
  const preview = sheet.preview;
  const title = sheet.name.trim() || 'Sem nome';
  const { lineage, subclassLine } = describeSheetPreview(preview);
  // Subclass and background share the quiet third line: both say who the character is, and each
  // alone would leave the line half empty.
  const detailLine = [subclassLine, preview?.backgroundName].filter(Boolean).join(' · ');

  return (
    <div className="relative h-full">
      <Link
        href={href}
        aria-label={`Abrir ficha ${title}`}
        className={cn(
          'group relative flex h-full flex-col overflow-hidden rounded-xl border bg-card p-5 transition-[border-color,box-shadow] duration-300 hover:shadow-md hover:shadow-primary/5 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground',
          featured
            ? 'border-primary/30 hover:border-primary/60'
            : 'border-border hover:border-primary/40'
        )}
      >
        <div
          className="pointer-events-none absolute inset-0 bg-linear-to-br from-primary/10 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100"
          aria-hidden="true"
        />

        {/* The system is the card's band: edge to edge, tinted. With an action, the corner it will
            occupy is reserved here. */}
        <div
          className={cn(
            'relative -mx-5 -mt-5 flex items-center justify-between gap-3 border-b border-primary/15 bg-primary/8 px-5 py-2.5',
            action && 'pr-16'
          )}
        >
          <SystemLabel name={packName} />
          {badge}
        </div>

        <div className="relative mt-4 flex items-start gap-4">
          <SheetArtTile preview={preview} packSlug={packSlug} size={featured ? 'lg' : 'md'} />
          <div className="min-w-0 flex-1">
            <h3
              className={cn(
                'truncate font-serif font-bold text-foreground',
                featured ? 'text-xl' : 'text-lg'
              )}
            >
              {title}
            </h3>
            {/* proportional-nums: a multiclass line ends each class with its level right before the
                `·`, and this font's tabular figures push the separator off centre. */}
            <p className="mt-0.5 truncate text-sm text-muted-foreground proportional-nums">
              {lineage || packName || 'Ficha de personagem'}
            </p>
            {detailLine ? (
              <p className="truncate text-xs text-muted-foreground">{detailLine}</p>
            ) : null}
          </div>
        </div>

        <div className="relative mt-auto pt-4">
          <div className="flex items-center gap-2 border-t border-border/60 pt-3 text-xs text-muted-foreground">
            {footer}
          </div>
        </div>
      </Link>

      {action ? <div className="absolute right-4 top-2 z-10">{action}</div> : null}
    </div>
  );
};
