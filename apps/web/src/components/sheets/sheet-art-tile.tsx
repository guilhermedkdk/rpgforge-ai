'use client';

import { Scroll } from 'lucide-react';
import type { CharacterSheetPreview } from '@rpgforce-ai/shared';
import { systemRegistry } from '@/components/systems/registry';
import { cn } from '@/lib/utils';
import { describeSheetPreview } from './sheet-preview-labels';

/** Tile geometry per size. The art is never smaller than 64px: species art at icon size is a blob. */
const SIZE = {
  md: { tile: 'h-24 w-24', art: 'h-16 w-16', badge: 'h-9 w-9', badgeArt: 'h-6 w-6' },
  lg: {
    tile: 'h-28 w-28 sm:h-32 sm:w-32',
    art: 'h-20 w-20',
    badge: 'h-10 w-10',
    badgeArt: 'h-7 w-7',
  },
} as const;

interface SheetArtTileProps {
  preview: CharacterSheetPreview | undefined;
  /** Class and species art are pack-specific, so they come from the system registry. */
  packSlug: string | null;
  size?: keyof typeof SIZE;
  className?: string;
}

/**
 * A character's art on a card: the SPECIES fills the tile, the class rides the corner as a badge, so
 * the card never has to choose one. Falls back to a neutral icon for a pack with no art.
 */
export const SheetArtTile = ({ preview, packSlug, size = 'md', className }: SheetArtTileProps) => {
  const system = packSlug ? systemRegistry[packSlug] : undefined;
  const ClassEmblem = system?.classEmblem ?? null;
  const RaceEmblem = system?.raceEmblem ?? null;
  const { badgeClassSlug, extraClassCount } = describeSheetPreview(preview);
  const s = SIZE[size];

  return (
    // The ring is a box-shadow, not a color, so it must be named in the transition list or it snaps
    // while the background still animates.
    <div
      className={cn(
        'relative shrink-0 rounded-xl bg-linear-to-br from-secondary to-secondary/30 ring-1 ring-border transition-[box-shadow,background-color] duration-300 group-hover:ring-primary/30',
        s.tile,
        className
      )}
    >
      <div className="flex h-full w-full items-center justify-center text-muted-foreground transition-colors duration-300 group-hover:text-primary-ink">
        {RaceEmblem && preview?.raceSlug ? (
          <RaceEmblem raceSlug={preview.raceSlug} className={s.art} />
        ) : ClassEmblem ? (
          <ClassEmblem classSlug={badgeClassSlug} className={s.art} />
        ) : (
          <Scroll className="h-10 w-10" aria-hidden="true" />
        )}
      </div>
      {/* Class badge: only when the tile is already showing the species, or it would repeat it. */}
      {RaceEmblem && preview?.raceSlug && ClassEmblem ? (
        <span
          className={cn(
            'absolute bottom-1 right-1 flex items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors duration-300 group-hover:text-primary-ink',
            s.badge
          )}
        >
          <ClassEmblem classSlug={badgeClassSlug} className={s.badgeArt} />
          {/* The badge names ONE class, so a multiclass sheet counts the ones it is not showing. It
              rides the badge's corner instead of sitting inline: in flow it widens the badge and
              competes with the art. Neutral on purpose: this is a read-out, not an alert. */}
          {extraClassCount > 0 ? (
            <span
              className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full border border-border bg-card px-0.5 text-[9px] font-semibold leading-none text-foreground"
              aria-hidden="true"
            >
              +{extraClassCount}
            </span>
          ) : null}
        </span>
      ) : null}
    </div>
  );
};
