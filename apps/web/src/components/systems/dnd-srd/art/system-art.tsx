import { DndClassEmblem } from './class-emblems';
import { DndRaceEmblem } from './race-emblems';
import { cn } from '@/lib/utils';

// One geometry, scaled: the fan has to keep its overlaps at both sizes.
const SIZE = {
  sm: { box: 'h-12 w-20', side: 'h-8 w-8 top-1.5', centre: 'h-12 w-12 left-6' },
  md: { box: 'h-24 w-40', side: 'h-16 w-16 top-3', centre: 'h-24 w-24 left-12' },
} as const;

/**
 * The system's calling card: a fan of its own emblems, so the pack is recognised by its art rather
 * than by a generic icon. Decorative only.
 */
export const DndSystemArt = ({
  size = 'md',
  className,
}: {
  size?: keyof typeof SIZE;
  className?: string;
}) => {
  const s = SIZE[size];
  return (
    <div className={cn('relative shrink-0', s.box, className)} aria-hidden="true">
      <DndClassEmblem
        classSlug="srd-2024_wizard"
        className={cn('absolute left-0 -rotate-12 opacity-40', s.side)}
      />
      <DndRaceEmblem
        raceSlug="srd-2024_dragonborn"
        className={cn('absolute top-0 opacity-90', s.centre)}
      />
      <DndClassEmblem
        classSlug="srd-2024_fighter"
        className={cn('absolute right-0 rotate-12 opacity-40', s.side)}
      />
    </div>
  );
};
