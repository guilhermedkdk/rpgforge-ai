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
 * stands. Confirming keeps the edit and drops the classes it invalidated; cancelling undoes it.
 *
 * Two blocks: the rule that was broken, then what leaves and what that costs. The score that
 * stopped qualifying is deliberately NOT restated here: the player just made the edit that moved it,
 * and the Classes row still spells it out for a sheet that arrived broken. The
 * class leaving is a CARD with its emblem, the same way a class is shown everywhere else on the
 * sheet, because "Warlock 1 goes away" is the consequence and should not be a noun inside a
 * paragraph.
 *
 * It borrows its vocabulary from the in-place removal confirmation in the Classes dialog, which asks
 * the same question and must not read as a different mechanism: bare `TriangleAlert` (the app spends
 * circled icons on neutral states like `EmptyState` and the landing hero, and leaves destructive
 * surfaces on a bare icon), `border-destructive/35 bg-card` surface, the class in bold, one muted
 * line for the way back, and a ghost/destructive pair of small buttons.
 *
 * The wording comes from the RESULT, never from the action: the guard reacts to the derived sheet,
 * so it knows which class stopped qualifying but not which control was clicked.
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
          {/* Icon grouped WITH the text, aligned to the first line: as a sibling of the block it
              floats free of the sentence it belongs to. Same arrangement as the Classes row. */}
          <div className="flex items-start gap-2.5 pr-4">
            <TriangleAlert className="mt-1 h-4 w-4 shrink-0 text-destructive" aria-hidden />
            <div className="min-w-0 flex-1">
              <DialogTitle>{title}</DialogTitle>
              <DialogDescription className="mt-1">
                {breach?.failingClassIsInitial
                  ? 'The initial class cannot leave the sheet, and with a single class the multiclass requirement stops applying.'
                  : 'A multiclass only stays on the sheet while its requirement holds.'}
              </DialogDescription>
            </div>
          </div>
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
