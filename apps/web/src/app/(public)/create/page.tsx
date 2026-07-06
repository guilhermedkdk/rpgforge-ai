'use client';

import { Suspense, useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Header } from '@/components/layout/header';
import { StepNavigator, type CreationStep } from '@/components/create/step-navigator';
import { StepActions } from '@/components/create/step-actions';
import { PackSelector } from '@/components/create/pack-selector';
import { StepModeSelect, type CreationMode } from '@/components/create/step-mode-select';
import { packsApi } from '@/lib/api/packs';
import { systemRegistry } from '@/components/systems/registry';
import { LoadingState } from '@/components/ui/loading-state';
import type { PackResponse } from '@rpgforce-ai/shared';

function CreatePageContent() {
  const searchParams = useSearchParams();
  const packIdFromUrl = searchParams.get('packId');
  const sheetIdFromUrl = searchParams.get('sheetId');

  const [step, setStep] = useState<CreationStep>('pack');
  const [selectedPackId, setSelectedPackId] = useState<string | null>(null);
  const [selectedMode, setSelectedMode] = useState<CreationMode>(null);

  const { data: packs = [], isLoading: packsLoading } = useQuery({
    queryKey: ['packs'],
    queryFn: packsApi.getAll,
  });

  const urlHydratedKeyRef = useRef<string | null>(null);
  const urlKey = `${packIdFromUrl ?? ''}|${sheetIdFromUrl ?? ''}`;

  useEffect(() => {
    if (!packs.length) return;
    if (!packIdFromUrl) {
      urlHydratedKeyRef.current = null;
      return;
    }
    const packExists = packs.some((p) => p.id === packIdFromUrl);
    if (!packExists) return;
    if (urlHydratedKeyRef.current === urlKey) return;
    urlHydratedKeyRef.current = urlKey;
    setSelectedPackId(packIdFromUrl);
    if (sheetIdFromUrl) {
      setSelectedMode('manual');
      setStep('editor');
    }
  }, [packs, packIdFromUrl, sheetIdFromUrl, urlKey]);

  const selectedPack = useMemo<PackResponse | null>(() => {
    if (!selectedPackId) return null;
    return packs.find((p) => p.id === selectedPackId) ?? null;
  }, [packs, selectedPackId]);

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
    (step === 'pack' && selectedPackId !== null) || (step === 'mode' && selectedMode !== null);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        <div className="flex flex-col">
          <StepNavigator currentStep={step} onNavigate={handleNavigate} />

          {step === 'pack' && (
            <PackSelector selectedPackId={selectedPackId} onSelect={setSelectedPackId} />
          )}

          {(step === 'mode' || step === 'editor') && (
            <>
              {step === 'mode' && selectedPackId && (
                <StepModeSelect selectedMode={selectedMode} onSelect={setSelectedMode} />
              )}
              {step === 'editor' && selectedMode === 'manual' && (
                <>
                  {packsLoading || !selectedPack ? (
                    <LoadingState />
                  ) : (() => {
                    const entry = systemRegistry[selectedPack.slug];
                    if (!entry) {
                      return (
                        <div className="rounded-lg border border-border bg-card p-12 text-center">
                          <p className="font-medium text-foreground">
                            O sistema <span className="font-bold">{selectedPack.name}</span> ainda não possui uma ficha de personagem disponível.
                          </p>
                        </div>
                      );
                    }
                    const SheetEditor = entry.editor;
                    return (
                      <SheetEditor
                        pack={selectedPack}
                        onBack={handleBack}
                        initialSheetId={sheetIdFromUrl}
                      />
                    );
                  })()}
                </>
              )}
              {step === 'editor' && selectedPackId && selectedMode === 'ai' && (
                <div className="rounded-lg border border-border bg-card p-12 text-center">
                  <p className="text-muted-foreground">
                    AI creation coming soon. For now, use manual creation.
                  </p>
                </div>
              )}
            </>
          )}
        </div>

        {step !== 'editor' && (
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
        )}
      </main>
    </div>
  );
}

export default function CreatePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen flex-col bg-background">
          <Header />
          <main className="mx-auto flex w-full max-w-5xl flex-1 items-center justify-center px-4 py-8">
            <LoadingState />
          </main>
        </div>
      }
    >
      <CreatePageContent />
    </Suspense>
  );
}
