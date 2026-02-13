'use client';

import { useState, useCallback } from 'react';
import { Header } from '@/components/layout/header';
import { StepNavigator, type CreationStep } from '@/components/create/step-navigator';
import { StepActions } from '@/components/create/step-actions';
import { PackSelector } from '@/components/create/pack-selector';
import { StepModeSelect, type CreationMode } from '@/components/create/step-mode-select';

export default function CreatePage() {
  const [step, setStep] = useState<CreationStep>('pack');
  const [selectedPackId, setSelectedPackId] = useState<string | null>(null);
  const [selectedMode, setSelectedMode] = useState<CreationMode>(null);

  const handleNavigate = useCallback((targetStep: CreationStep) => {
    if (targetStep === 'pack') {
      setStep('pack');
      setSelectedPackId(null);
      setSelectedMode(null);
    } else if (targetStep === 'mode') {
      setStep('mode');
      setSelectedMode(null);
    } else {
      setStep('editor');
    }
  }, []);

  const handleContinue = useCallback(() => {
    if (step === 'pack' && selectedPackId) {
      setStep('mode');
    } else if (step === 'mode' && selectedMode) {
      setStep('editor');
    }
  }, [step, selectedPackId, selectedMode]);

  const handleBack = useCallback(() => {
    if (step === 'mode') {
      setStep('pack');
      setSelectedPackId(null);
    } else if (step === 'editor') {
      setStep('mode');
      setSelectedMode(null);
    }
  }, [step]);

  const canContinue =
    (step === 'pack' && selectedPackId !== null) ||
    (step === 'mode' && selectedMode !== null);

  return (
    <div className="flex min-h-screen flex-col bg-background overflow-y-auto">
      <Header />

      <main className="mx-auto flex w-full max-w-5xl flex-col pb-12">
        <div className="flex flex-col px-4 py-8 pb-6">
          <StepNavigator currentStep={step} onNavigate={handleNavigate} />

          {step === 'pack' && (
            <PackSelector
              selectedPackId={selectedPackId}
              onSelect={setSelectedPackId}
            />
          )}

          {(step === 'mode' || step === 'editor') && (
            <>
              {step === 'mode' && selectedPackId && (
                <StepModeSelect selectedMode={selectedMode} onSelect={setSelectedMode} />
              )}
              {step === 'editor' && selectedPackId && selectedMode && (
                <div className="rounded-lg border border-border bg-card p-12 text-center">
                  <p className="text-muted-foreground">
                    Editor em breve. Modo: {selectedMode === 'ai' ? 'IA' : 'Manual'}
                  </p>
                </div>
              )}
            </>
          )}
        </div>

        <div className="fixed bottom-0 left-0 right-0 z-10 flex justify-center">
          <div className="w-full max-w-5xl border-t border-border bg-background px-4 py-1.5">
            <StepActions
              currentStep={step}
              canContinue={canContinue}
              onBack={handleBack}
              onContinue={handleContinue}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
