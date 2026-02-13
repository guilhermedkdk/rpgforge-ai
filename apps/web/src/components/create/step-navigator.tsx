'use client';

import { Check, Swords, Flame, Pen } from 'lucide-react';

export type CreationStep = 'pack' | 'mode' | 'editor';

interface StepNavigatorProps {
  currentStep: CreationStep;
  onNavigate: (step: CreationStep) => void;
}

const steps: { id: CreationStep; label: string; icon: typeof Swords }[] = [
  { id: 'pack', label: 'Sistema', icon: Swords },
  { id: 'mode', label: 'Método', icon: Flame },
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
                className={`mx-2 h-px w-6 transition-colors sm:mx-3 sm:w-10 ${
                  isCompleted ? 'bg-primary/50' : 'bg-border'
                }`}
              />
            )}

            <button
              type="button"
              disabled={!isClickable}
              onClick={() => isClickable && onNavigate(step.id)}
              className={`group flex items-center gap-2 rounded-full transition-all ${
                isClickable ? 'cursor-pointer' : 'cursor-default'
              }`}
              aria-current={isCurrent ? 'step' : undefined}
              aria-label={`${step.label}${isCompleted ? ' (concluído, clique para voltar)' : isCurrent ? ' (atual)' : ''}`}
            >
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-all ${
                  isCompleted
                    ? 'bg-primary/20 text-primary group-hover:bg-primary/30'
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

              <span
                className={`hidden text-sm font-medium transition-colors sm:inline ${
                  isCompleted
                    ? 'text-primary group-hover:text-primary/80'
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
