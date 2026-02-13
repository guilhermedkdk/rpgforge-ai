'use client';

import { ArrowLeft, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { CreationStep } from '@/components/create/step-navigator';

interface StepActionsProps {
  currentStep: CreationStep;
  canContinue: boolean;
  onBack: () => void;
  onContinue: () => void;
}

export const StepActions = ({ currentStep, canContinue, onBack, onContinue }: StepActionsProps) => {
  const isFirstStep = currentStep === 'pack';

  return (
    <div className="flex items-center justify-between" role="group" aria-label="Ações da etapa">
      {isFirstStep ? (
        <div aria-hidden="true" />
      ) : (
        <Button
          variant="ghost"
          onClick={onBack}
          className="gap-2 text-muted-foreground hover:text-foreground"
          aria-label="Voltar para a etapa anterior"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Voltar
        </Button>
      )}

      {currentStep !== 'editor' && (
        <Button
          size="lg"
          disabled={!canContinue}
          onClick={onContinue}
          className="gap-2"
          aria-label={
            canContinue ? 'Continuar para a próxima etapa' : 'Selecione uma opção para continuar'
          }
        >
          Continuar
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Button>
      )}
    </div>
  );
};
