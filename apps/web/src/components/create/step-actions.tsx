'use client';

import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

// Only the navigational "Continuar" carries an icon (the arrow); terminal actions (Salvar/Gerar
// ficha) pass 'none', so the bar's icon usage stays standardized.
export type StepActionsIcon = 'arrow' | 'none';

/** Centered readout between the two buttons. */
export type StepActionsStatus =
  | { kind: 'error'; message: string }
  | { kind: 'progress'; pending: number };

export interface StepActionsProps {
  /** Omit to hide the back button (e.g. the first step). */
  onBack?: () => void;
  /** Omit to hide the continue button; while `loading` the slot is kept either way. */
  onContinue?: () => void;
  canContinue?: boolean;
  loading?: boolean;
  backLabel?: string;
  continueLabel?: string;
  continueIcon?: StepActionsIcon;
  status?: StepActionsStatus | null;
}

const CONTINUE_ICONS = { arrow: ArrowRight } as const;

const StatusReadout = ({ status }: { status: StepActionsStatus }) => {
  if (status.kind === 'error') {
    return <p className="truncate text-center text-xs text-destructive">{status.message}</p>;
  }
  if (status.pending === 0) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <Check className="h-3.5 w-3.5 text-primary" aria-hidden />
        Pronta para salvar
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-primary">
      <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden />
      {status.pending === 1 ? 'Falta 1 escolha' : `Faltam ${status.pending} escolhas`}
    </span>
  );
};

/**
 * Fixed bottom action bar of the create flow. The page renders exactly ONE, for every step, and each
 * step publishes into it via `useStepActions` (see `step-actions-slot`). It must never be rendered by
 * a step itself: a bar that unmounts with its step blinks out on every transition.
 */
export const StepActions = ({
  onBack,
  onContinue,
  canContinue = true,
  loading = false,
  backLabel = 'Voltar',
  continueLabel = 'Continuar',
  continueIcon = 'arrow',
  status,
}: StepActionsProps) => {
  const ContinueIcon = continueIcon === 'none' ? null : CONTINUE_ICONS[continueIcon];

  return (
    <div className="fixed bottom-0 left-0 right-0 z-10 flex justify-center">
      <div className="w-full max-w-5xl border-t border-border bg-background px-4 py-1.5">
        <div className="flex items-center justify-between" role="group" aria-label="Ações da etapa">
          {onBack ? (
            <Button
              variant="ghost"
              onClick={onBack}
              disabled={loading}
              className="gap-2 text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              {backLabel}
            </Button>
          ) : (
            <div aria-hidden="true" />
          )}

          {status ? (
            <div className="min-w-0 px-2">
              <StatusReadout status={status} />
            </div>
          ) : null}

          {/* Reserved while loading too, so the bar keeps its shape when a step takes the slot over. */}
          {(onContinue || loading) && (
            <Button onClick={onContinue} disabled={!canContinue || loading} className="gap-2">
              {loading ? (
                <Spinner size="sm" />
              ) : (
                <>
                  {continueLabel}
                  {ContinueIcon ? <ContinueIcon className="h-4 w-4" aria-hidden="true" /> : null}
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};
