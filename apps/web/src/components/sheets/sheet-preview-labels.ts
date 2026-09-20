import type { CharacterSheetPreview } from '@rpgforce-ai/shared';

export interface SheetPreviewLabels {
  /** "Guerreiro 3 · Mago 5" for a multiclass sheet, the single class name otherwise. */
  classLabel: string | null;
  subclassLine: string | null;
  /** Species and class joined, empty when the sheet has neither. */
  lineage: string;
  /** Class the art badge names: the one with the most levels, the initial class breaking a tie. */
  badgeClassSlug: string | null;
  /** How many classes the badge is NOT showing. */
  extraClassCount: number;
}

/**
 * Turns a sheet preview into the strings and art keys a card shows.
 *
 * A multiclass character reads as "Guerreiro 3 · Mago 5": the class name alone would hide half of
 * it, and the total level is already its own chip on the card.
 */
export const describeSheetPreview = (
  preview: CharacterSheetPreview | undefined
): SheetPreviewLabels => {
  const classes = preview?.classes ?? [];
  const multiclass = classes.length > 1;
  const classLabel = multiclass
    ? classes.map((c) => `${c.name ?? '?'} ${c.level}`).join(' · ')
    : (preview?.className ?? null);

  const badgeClassSlug =
    classes.reduce<(typeof classes)[number] | null>(
      (best, entry) => (best && best.level >= entry.level ? best : entry),
      null
    )?.slug ??
    preview?.classSlug ??
    null;

  const subclassLine = multiclass
    ? classes
        .map((c) => c.subclassName)
        .filter(Boolean)
        .join(' · ')
    : (preview?.subclassName ?? null);

  return {
    classLabel,
    subclassLine: subclassLine || null,
    lineage: [preview?.raceName, classLabel].filter(Boolean).join(' · '),
    badgeClassSlug,
    extraClassCount: multiclass ? classes.length - 1 : 0,
  };
};
