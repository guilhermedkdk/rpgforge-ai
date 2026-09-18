'use client';

import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { ChevronRight, Globe, Heart, History, Scroll, Shield, Star } from 'lucide-react';
import type { ReactNode } from 'react';
import type { CharacterSheetSummary } from '@rpgforce-ai/shared';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { systemRegistry } from '@/components/systems/registry';

// Date only on the card; the full timestamp stays in the `title` for whoever needs it.
const formatUpdatedAtDate = (iso: string): string => {
  try {
    return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(new Date(iso));
  } catch {
    return iso;
  }
};

const formatUpdatedAt = (iso: string): string => {
  try {
    return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(
      new Date(iso)
    );
  } catch {
    return iso;
  }
};

const StatChip = ({ icon: Icon, label }: { icon: LucideIcon; label: string }) => (
  <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background/60 px-2.5 py-1 text-xs text-muted-foreground">
    <Icon className="h-3 w-3 text-primary-ink" aria-hidden="true" />
    {label}
  </span>
);

interface SheetListCardProps {
  sheet: CharacterSheetSummary;
  packName: string | null;
  packSlug: string | null;
  /** Where the card leads. Defaults to the owner's editable sheet. */
  href?: string;
  /** Replaces the "last updated" stamp; the explore feed puts the author there instead. */
  footerRight?: ReactNode;
  /** Marks a sheet the owner has published. Off on the explore feed, where every card is public. */
  showPublicBadge?: boolean;
  /**
   * Control pinned to the card's top-right corner (the favourite toggle). Rendered as a SIBLING of
   * the link, not inside it: a button nested in an anchor is invalid, and the corner is the chevron's
   * spot, so the chevron steps aside — both point at the same place and the bookmark does more.
   */
  action?: ReactNode;
}

/** Sheet card for the "Minhas Fichas" grid: the whole card is the link that opens the sheet. */
export const SheetListCard = ({
  sheet,
  packName,
  packSlug,
  href,
  footerRight,
  showPublicBadge = false,
  action,
}: SheetListCardProps) => {
  const preview = sheet.preview;
  const title = sheet.name.trim() || 'Sem nome';
  // Class and species art are pack-specific, so they come from the system registry, not from this
  // shared card.
  const system = packSlug ? systemRegistry[packSlug] : undefined;
  const ClassEmblem = system?.classEmblem ?? null;
  const RaceEmblem = system?.raceEmblem ?? null;

  // A multiclass character reads as "Fighter 3 · Wizard 5": the class name alone would hide half of
  // it, and the total level is already its own chip below.
  const classes = preview?.classes ?? [];
  const multiclass = classes.length > 1;
  const classLabel = multiclass
    ? classes.map((c) => `${c.name ?? '?'} ${c.level}`).join(' · ')
    : (preview?.className ?? null);
  // The art tile shows the SPECIES (what the character is, whatever they multiclass into) and the
  // corner badge the class, so the card never has to choose one. The badge follows the class with
  // the most levels, the initial class breaking a tie: a Paladin 3 / Warlock 17 is a Warlock.
  const badgeClassSlug =
    classes.reduce<(typeof classes)[number] | null>(
      (best, entry) => (best && best.level >= entry.level ? best : entry),
      null
    )?.slug ??
    preview?.classSlug ??
    null;
  // The badge names ONE class, so a multiclass sheet has to say how many more it hides. Counting the
  // extras (+1) rather than the total (2) keeps it reading as "this one, plus another".
  const extraClassCount = multiclass ? classes.length - 1 : 0;
  const lineage = [preview?.raceName, classLabel].filter(Boolean).join(' · ');
  const subtitle = lineage || packName || 'Ficha de personagem';
  const subclassLine = multiclass
    ? classes
        .map((c) => c.subclassName)
        .filter(Boolean)
        .join(' · ')
    : preview?.subclassName;

  const card = (
    <Link
      href={href ?? `/sheets/${encodeURIComponent(sheet.id)}`}
      aria-label={`Abrir ficha ${title}`}
      className="group relative flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card p-5 transition-[border-color,box-shadow] duration-300 hover:border-primary/40 hover:shadow-md hover:shadow-primary/5 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
    >
      <div
        className="pointer-events-none absolute inset-0 bg-linear-to-br from-primary/10 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        aria-hidden="true"
      />

      <div className="relative flex items-start gap-4">
        {/* The art tile is 96px because detail is invisible at icon size: species art at 32px reads
            as a blob whatever it depicts. The ring is a box-shadow, not a color, so it must be
            named in the transition list or it snaps while the background still animates. */}
        <div className="relative h-24 w-24 shrink-0 rounded-xl bg-linear-to-br from-secondary to-secondary/30 ring-1 ring-border transition-[box-shadow,background-color] duration-300 group-hover:ring-primary/30">
          <div className="flex h-full w-full items-center justify-center text-muted-foreground transition-colors duration-300 group-hover:text-primary-ink">
            {RaceEmblem && preview?.raceSlug ? (
              <RaceEmblem raceSlug={preview.raceSlug} className="h-16 w-16" />
            ) : ClassEmblem ? (
              <ClassEmblem classSlug={badgeClassSlug} className="h-16 w-16" />
            ) : (
              <Scroll className="h-10 w-10" aria-hidden="true" />
            )}
          </div>
          {/* Class badge: only when the tile is already showing the species, or it would repeat it. */}
          {RaceEmblem && preview?.raceSlug && ClassEmblem ? (
            <span className="absolute bottom-1 right-1 flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors duration-300 group-hover:text-primary-ink">
              <ClassEmblem classSlug={badgeClassSlug} className="h-6 w-6" />
              {/* The badge names ONE class, so a multiclass sheet counts the ones it is NOT showing.
                  It rides the badge's corner instead of sitting inline: in flow it widens the badge
                  and competes with the art. Neutral on purpose: this is a read-out, not an alert. */}
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
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="min-w-0 truncate font-serif text-lg font-bold text-foreground">
              {title}
            </h3>
            {/* A MARK, not a badge: the card already wears three bordered capsules under the
                title, and a fourth one there both shouted and stole the width the name needed
                (measured: "Serafin Lógrath" truncated to two syllables with it). The tooltip says
                WHERE it was published, since "publicada" alone leaves the reader asking. */}
            {showPublicBadge && sheet.isPublic ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="shrink-0 cursor-pointer text-primary-ink">
                    <Globe className="h-4 w-4" aria-hidden="true" />
                    <span className="sr-only">
                      Publicada: qualquer pessoa pode ver esta ficha, e ela aparece na página
                      Explorar.
                    </span>
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-56">
                  Publicada: qualquer pessoa pode ver esta ficha, e ela aparece na página Explorar.
                </TooltipContent>
              </Tooltip>
            ) : null}
          </div>
          {/* proportional-nums: a multiclass subtitle ends each class with its level right before
              the `·`, and this font's tabular figures leave a lone `1` ~2px of trailing air,
              pushing the separator off centre (measured). Nothing here lines up in a column. */}
          <p className="mt-0.5 truncate text-sm text-muted-foreground proportional-nums">
            {subtitle}
          </p>
          {subclassLine && (
            <p className="truncate text-xs text-muted-foreground">{subclassLine}</p>
          )}
        </div>
        {action ? (
          // Keeps the row's geometry: the corner control sits in the overlay, this reserves its width.
          <span className="mt-1 h-5 w-9 shrink-0" aria-hidden="true" />
        ) : (
          <ChevronRight
            className="mt-1 h-5 w-5 shrink-0 text-muted-foreground/40 transition-colors duration-300 group-hover:text-primary-ink"
            aria-hidden="true"
          />
        )}
      </div>

      <div className="relative mt-auto pt-5">
        {(preview?.level || preview?.maxHp || preview?.armorClass) && (
          <div className="flex flex-wrap gap-2">
            {preview.level ? <StatChip icon={Star} label={`Nível ${preview.level}`} /> : null}
            {preview.maxHp ? <StatChip icon={Heart} label={`${preview.maxHp} PV`} /> : null}
            {preview.armorClass ? (
              <StatChip icon={Shield} label={`CA ${preview.armorClass}`} />
            ) : null}
          </div>
        )}
        <div className="mt-4 flex items-center justify-between gap-3">
          <span className="min-w-0 truncate text-xs font-semibold tracking-wide text-foreground/80">
            {packName ?? 'Sistema de regras'}
          </span>
          {footerRight ?? (
            <span
              className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground"
              title={`Atualizado em ${formatUpdatedAt(sheet.updatedAt)}`}
            >
              <History className="h-3 w-3" aria-hidden="true" />
              {formatUpdatedAtDate(sheet.updatedAt)}
            </span>
          )}
        </div>
      </div>
    </Link>
  );

  if (!action) return card;
  return (
    <div className="relative h-full">
      {card}
      <div className="absolute right-4 top-4 z-10">{action}</div>
    </div>
  );
};
