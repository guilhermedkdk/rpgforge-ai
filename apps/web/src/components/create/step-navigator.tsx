'use client';

import { Check, Swords, Split, Pen } from 'lucide-react';

export type CreationStep = 'pack' | 'mode' | 'editor';

interface StepNavigatorProps {
  currentStep: CreationStep;
  onNavigate: (step: CreationStep) => void;
}

const steps: { id: CreationStep; label: string; icon: typeof Swords }[] = [
  { id: 'pack', label: 'Sistema', icon: Swords },
  { id: 'mode', label: 'Método', icon: Split },
  { id: 'editor', label: 'Criação', icon: Pen },
];

const stepOrder: CreationStep[] = ['pack', 'mode', 'editor'];

function getStepIndex(step: CreationStep): number {
  return stepOrder.indexOf(step);
}

export const StepNavigator = ({ currentStep, onNavigate }: StepNavigatorProps) => {
  const currentIndex = getStepIndex(currentStep);

  return (
    <nav aria-label="Progresso da criação" className="mb-8 flex items-center justify-center gap-0">
      {steps.map((step, index) => {
        const isCompleted = index < currentIndex;
        const isCurrent = step.id === currentStep;
        const isClickable = isCompleted;
        const StepIcon = step.icon;

        return (
          <div key={step.id} className="flex items-center">
            {index > 0 && (
              <div
                className={`mx-1 h-px w-4 transition-colors sm:mx-3 sm:w-10 ${
                  isCompleted ? 'bg-primary/50' : 'bg-border'
                }`}
              />
            )}

            <button
              type="button"
              disabled={!isClickable}
              onClick={() => isClickable && onNavigate(step.id)}
              className={`group flex items-center gap-2 rounded-full transition-colors ${
                isClickable ? 'cursor-pointer' : 'cursor-default'
              }`}
              aria-current={isCurrent ? 'step' : undefined}
              aria-label={`${step.label}${isCompleted ? ' (concluída, clique para voltar)' : isCurrent ? ' (atual)' : ''}`}
            >
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                  isCompleted
                    ? 'bg-primary/20 text-primary-ink group-hover:bg-primary/30'
                    : isCurrent
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-secondary text-muted-foreground'
                }`}
              >
                {isCompleted ? (
                  <Check className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <StepIcon className="h-4 w-4" aria-hidden="true" />
                )}
              </div>

              {/* Shown at every width: three icons with no captions leave a phone user unable to
                  tell what the steps even are. The connectors shrink instead. */}
              <span
                className={`text-xs font-medium transition-colors sm:text-sm ${
                  isCompleted
                    ? 'text-primary-ink group-hover:text-primary-ink/80'
                    : isCurrent
                      ? 'text-foreground'
                      : 'text-muted-foreground'
                }`}
              >
                {step.label}
              </span>
            </button>
          </div>
        );
      })}
    </nav>
  );
};
