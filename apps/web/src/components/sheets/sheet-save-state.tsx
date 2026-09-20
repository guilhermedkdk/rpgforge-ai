'use client';

import type { ReactNode } from 'react';
import { Check, Save } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { SheetChip } from '@/components/sheets/sheet-chip';

/** What the sheet's save state looks like right now. */
export type SheetSaveState = 'clean' | 'dirty' | 'saving' | 'saved';

export const resolveSheetSaveState = (opts: {
  dirty: boolean;
  saving: boolean;
  saved: boolean;
}): SheetSaveState => {
  if (opts.saving) return 'saving';
  if (opts.saved) return 'saved';
  return opts.dirty ? 'dirty' : 'clean';
};

/**
 * Header readout, deliberately NOT a control: the header answers "is my work safe?", and the actions
 * that change that live in the floating bar (which only exists while there is something to save).
 */
export const SheetSaveStateChip = ({ state }: { state: SheetSaveState }) => {
  if (state === 'saving') {
    return <SheetChip icon={<Spinner size="sm" />}>Salvando</SheetChip>;
  }

  // Short on purpose: it sits next to the visibility chip, and "Alterações não salvas" made that row
  // read as a sentence instead of two states. The floating bar spells it out where it is actionable.
  if (state === 'dirty') {
    return (
      <SheetChip
        tone="attention"
        icon={<span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />}
        title="Você tem alterações que ainda não foram salvas"
      >
        Não salvo
      </SheetChip>
    );
  }

  return (
    <SheetChip
      icon={
        <Check className={cn('h-3 w-3', state === 'saved' && 'text-primary-ink')} aria-hidden />
      }
    >
      Salvo
    </SheetChip>
  );
};

interface UnsavedChangesBarProps {
  saving: boolean;
  onSave: () => void;
  onDiscard: () => void;
  /** Rendered under the actions (save failure + its recovery action). */
  footer?: ReactNode;
}

/**
 * Floating action bar, shown only while there are unsaved changes. The sheet is ~2000px tall, so the
 * primary action has to follow the player instead of living at the top of the page.
 */
export const UnsavedChangesBar = ({
  saving,
  onSave,
  onDiscard,
  footer,
}: UnsavedChangesBarProps) => (
  <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-4 print:hidden">
    <div
      className="pointer-events-auto flex flex-col gap-2 rounded-full border border-border bg-card/95 px-3 py-2 shadow-lg backdrop-blur animate-in fade-in slide-in-from-bottom-2 duration-200 data-[has-footer=true]:rounded-2xl"
      data-has-footer={footer ? 'true' : 'false'}
      role="region"
      aria-label="Alterações não salvas"
    >
      <div className="flex items-center gap-3">
        <span className="inline-flex items-center gap-2 pl-2 text-xs font-medium text-foreground">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
          Alterações não salvas
        </span>
        <span className="flex items-center gap-1.5">
          <Button type="button" variant="ghost" size="sm" disabled={saving} onClick={onDiscard}>
            Descartar
          </Button>
          <Button
            type="button"
            size="sm"
            className="rounded-full"
            disabled={saving}
            onClick={onSave}
            aria-label={saving ? 'Salvando' : undefined}
          >
            {saving ? (
              <Spinner size="sm" />
            ) : (
              <>
                <Save className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                Salvar
              </>
            )}
          </Button>
        </span>
      </div>
      {footer}
    </div>
  </div>
);
