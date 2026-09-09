'use client';

import { Suspense, useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Header } from '@/components/layout/header';
import { StepNavigator, type CreationStep } from '@/components/create/step-navigator';
import { StepActions, type StepActionsProps } from '@/components/create/step-actions';
import { StepActionsSlotProvider, useStepActionsSlot } from '@/components/create/step-actions-slot';
import { PackSelector } from '@/components/create/pack-selector';
import { StepModeSelect, type CreationMode } from '@/components/create/step-mode-select';
import { AiWizard } from '@/components/create/ai/ai-wizard';
import { packsApi } from '@/lib/api/packs';
import { systemRegistry } from '@/components/systems/registry';
import { LoadingState } from '@/components/ui/loading-state';
import { useSessionDraft } from '@/hooks/use-session-draft';
import { DRAFT_KEYS, takeSessionDraft } from '@/lib/session-draft';
import type { PackResponse } from '@rpgforce-ai/shared';

/** Where the flow stood, so signing in mid-creation comes back to the same screen. */
interface CreateStepDraft {
  step: CreationStep;
  packId: string | null;
  mode: CreationMode;
}

function CreatePageContent() {
  const searchParams = useSearchParams();
  const packIdFromUrl = searchParams.get('packId');

  const [step, setStep] = useState<CreationStep>('pack');
  const [selectedPackId, setSelectedPackId] = useState<string | null>(null);
  const [selectedMode, setSelectedMode] = useState<CreationMode>('ai');
  const [draftRestored, setDraftRestored] = useState(false);
  const { slot, props: publishedActions } = useStepActionsSlot();

  // Restored after mount rather than in a state initializer: the server pass has no sessionStorage,
  // and seeding from it would hydrate to different markup.
  useEffect(() => {
    const draft = takeSessionDraft<CreateStepDraft>(DRAFT_KEYS.createStep);
    if (draft) {
      setStep(draft.step);
      setSelectedPackId(draft.packId);
      setSelectedMode(draft.mode);
    }
    setDraftRestored(true);
  }, []);

  useSessionDraft<CreateStepDraft>(DRAFT_KEYS.createStep, () => ({
    step,
    packId: selectedPackId,
    mode: selectedMode,
  }));

  const { data: packs = [], isLoading: packsLoading } = useQuery({
    queryKey: ['packs'],
    queryFn: packsApi.getAll,
  });

  const urlHydratedPackRef = useRef<string | null>(null);

  useEffect(() => {
    if (!packs.length) return;
    if (!packIdFromUrl) {
      urlHydratedPackRef.current = null;
      return;
    }
    if (!packs.some((p) => p.id === packIdFromUrl)) return;
    if (urlHydratedPackRef.current === packIdFromUrl) return;
    urlHydratedPackRef.current = packIdFromUrl;
    setSelectedPackId(packIdFromUrl);
  }, [packs, packIdFromUrl]);

  const selectedPack = useMemo<PackResponse | null>(() => {
    if (!selectedPackId) return null;
    return packs.find((p) => p.id === selectedPackId) ?? null;
  }, [packs, selectedPackId]);

  const handleNavigate = useCallback((targetStep: CreationStep) => {
    if (targetStep === 'pack') {
      setStep('pack');
      setSelectedPackId(null);
      setSelectedMode('ai');
    } else if (targetStep === 'mode') {
      setStep('mode');
      setSelectedMode('ai');
    } else {
      setStep('editor');
    }
  }, []);

  const handleContinue = useCallback(() => {
    if (step === 'pack' && selectedPackId) {
      setStep('mode');
    } else if (step === 'mode') {
      setStep('editor');
    }
  }, [step, selectedPackId]);

  const handleBack = useCallback(() => {
    if (step === 'mode') {
      setStep('pack');
      setSelectedPackId(null);
    } else if (step === 'editor') {
      setStep('mode');
      setSelectedMode('ai');
    }
  }, [step]);

  const canContinue = (step === 'pack' && selectedPackId !== null) || step === 'mode';

  // Used until a step claims the slot. The editor step needs one because it is a dynamic chunk behind
  // a Suspense boundary React throttles ~300ms: without this the bar would blink out on the way in.
  const defaultActions: StepActionsProps =
    step === 'editor'
      ? { onBack: handleBack, continueLabel: 'Salvar Ficha', continueIcon: 'none', loading: true }
      : {
          onBack: step === 'pack' ? undefined : handleBack,
          onContinue: handleContinue,
          canContinue,
        };
  const actions = publishedActions === undefined ? defaultActions : publishedActions;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        <StepActionsSlotProvider value={slot}>
          {/* Held for the one tick the draft takes to read, so a restored flow never paints the
              pack step first and jumps. It is the same LoadingState the Suspense fallback shows. */}
          {!draftRestored ? (
            <LoadingState />
          ) : (
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
                      ) : (
                        (() => {
                          const entry = systemRegistry[selectedPack.slug];
                          if (!entry) {
                            return (
                              <div className="rounded-lg border border-border bg-card p-12 text-center">
                                <p className="font-medium text-foreground">
                                  O sistema <span className="font-bold">{selectedPack.name}</span>{' '}
                                  ainda não possui uma ficha de personagem disponível.
                                </p>
                              </div>
                            );
                          }
                          const SheetEditor = entry.editor;
                          return <SheetEditor pack={selectedPack} onBack={handleBack} />;
                        })()
                      )}
                    </>
                  )}
                  {step === 'editor' && selectedMode === 'ai' && (
                    <>
                      {packsLoading || !selectedPack ? (
                        <LoadingState />
                      ) : (
                        <AiWizard pack={selectedPack} onExit={handleBack} />
                      )}
                    </>
                  )}
                </>
              )}
            </div>
          )}

          {actions && <StepActions {...actions} />}
        </StepActionsSlotProvider>
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
