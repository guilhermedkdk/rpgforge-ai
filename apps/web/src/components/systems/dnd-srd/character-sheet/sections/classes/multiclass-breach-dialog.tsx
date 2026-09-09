'use client';

import { TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { DndClassEmblem } from '../../../art/class-emblems';
import type { MulticlassPrerequisiteBreach } from '../../../hooks/use-multiclass-prerequisite-guard';

const sectionLabelClass =
  'text-[10px] font-semibold uppercase tracking-widest text-muted-foreground';

interface MulticlassBreachDialogProps {
  breach: MulticlassPrerequisiteBreach | null;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Pairs with `useMulticlassPrerequisiteGuard`: the edit that broke a requirement asks before it
 * stands. Confirming keeps the edit and drops the classes it invalidated.
 *
 * Vocabulary and surface are borrowed from the removal confirmation in the Classes dialog, which
 * asks the same question and must not read as a different mechanism. The wording comes from the
 * RESULT: the guard knows which class stopped qualifying, never which control was clicked.
 */
export function MulticlassBreachDialog({
  breach,
  onConfirm,
  onCancel,
}: MulticlassBreachDialogProps) {
  const removals = breach?.removals ?? [];
  const plural = removals.length > 1;
  // The title names ONE class; with several it counts them. A list here grows without bound (three
  // classes is legal), and the card below already says exactly which ones.
  const title = plural
    ? `Remove ${removals.length} classes?`
    : `Remove ${removals[0]?.className ?? 'class'}?`;

  return (
    <Dialog open={breach != null} onOpenChange={(next) => !next && onCancel()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          {/* Icon INSIDE the title, like every other dialog: it stays attached to the first line, and
              title/description remain direct children, so `DialogHeader`'s own gap is the single
              source for the spacing between them (a hand-written margin here diverged from it). */}
          <DialogTitle className="flex items-center gap-2 pr-4">
            <TriangleAlert className="h-4 w-4 shrink-0 text-destructive" aria-hidden />
            {title}
          </DialogTitle>
          <DialogDescription>
            {breach?.failingClassIsInitial
              ? 'The initial class cannot leave the sheet, and with a single class the multiclass requirement stops applying.'
              : 'A multiclass only stays on the sheet while its requirement holds.'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-1.5">
          <span className={sectionLabelClass}>Leaves the sheet</span>
          {removals.map((entry) => (
            <div
              key={entry.classRuleItemId}
              className="flex items-center gap-2.5 rounded-md border border-destructive/35 bg-card px-3 py-2"
            >
              <DndClassEmblem
                classSlug={entry.slug}
                className="h-4.5 w-4.5 shrink-0 text-destructive"
              />
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
                {entry.className}
              </span>
              {/* Labelled: a bare number on a card reads as a count, not the class's level.
                  Tabular so two classes line their levels up. */}
              <span className="shrink-0 text-xs font-semibold tabular-nums text-muted-foreground">
                Level {entry.level}
              </span>
            </div>
          ))}
          <p className="text-xs leading-relaxed text-muted-foreground">
            {plural ? 'Their levels' : 'Its levels'} and everything they granted go with{' '}
            {plural ? 'them' : 'it'}: features, spells, proficiencies and any choice you made for{' '}
            {plural ? 'those classes' : 'this class'}. Cancelling puts your change back.
          </p>
        </div>

        <DialogFooter className="gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            Cancel change
          </Button>
          <Button type="button" variant="destructive" size="sm" onClick={onConfirm}>
            Remove
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
