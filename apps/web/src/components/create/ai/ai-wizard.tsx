'use client';

import * as React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Anvil, Dices, Feather, Lightbulb, Pencil, Sparkles } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { systemRegistry } from '@/components/systems/registry';
import { BrowseMarkdown } from '@/components/systems/dnd-srd/library/browser/browse-markdown';
import { LoadingState } from '@/components/ui/loading-state';
import { useStepActions } from '@/components/create/step-actions-slot';
import { useAuthGate } from '@/contexts/auth-gate';
import { useSessionDraft } from '@/hooks/use-session-draft';
import { DRAFT_KEYS, takeSessionDraft } from '@/lib/session-draft';
import { useAiGeneration } from './use-ai-generation';
import type {
  PackResponse,
  GenerationQuestion,
  GenerateCharacterResponse,
} from '@rpgforce-ai/shared';

interface AiWizardProps {
  pack: PackResponse;
  /** Return to the mode-selection step. */
  onExit: () => void;
}

type SubStep = 'prompt' | 'questions' | 'review';

/** Everything the wizard would otherwise lose to the provider round trip. */
interface AiWizardDraft {
  subStep: SubStep;
  prompt: string;
  note: string;
  questions: GenerationQuestion[];
  answers: Record<string, string>;
  result: GenerateCharacterResponse | null;
  generationId?: string;
}

const MIN_PROMPT = 3;

const SIGN_IN_REASON =
  'Sua ideia continua aqui. Entre para a IA montar a ficha, e voltamos exatamente para este ponto.';

// Deliberately far apart: each one pulls a different class, tone and level, and none names a class
// (the wizard is the one interpreting). Four variations of the same forest hero show nothing.
const EXAMPLE_CONCEPTS = [
  'Uma ladra que rouba pesadelos e revende sonhos nos becos da cidade',
  'Um gladiador aposentado que jurou nunca mais erguer a lâmina',
  'Um cozinheiro de taverna arrastado para a aventura, briga com o que tiver na mão',
  'Uma anciã que troca memórias por magia e já não lembra o próprio nome',
];

const THINKING_PHRASES = [
  'Pensando…',
  'Interpretando sua ideia…',
  'Consultando as regras do sistema…',
  'Preparando as perguntas…',
];

const FORGING_PHRASES = [
  'Acendendo a forja…',
  'Escolhendo espécie, classe e antecedente…',
  'Distribuindo os atributos…',
  'Selecionando magias e equipamento…',
  'Escrevendo a história…',
  'Dando os últimos retoques…',
];

export function AiWizard({ pack, onExit }: AiWizardProps) {
  const [subStep, setSubStep] = useState<SubStep>('prompt');
  const [prompt, setPrompt] = useState('');
  const [note, setNote] = useState('');
  const [questions, setQuestions] = useState<GenerationQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<GenerateCharacterResponse | null>(null);
  // Opaque id of this wizard interaction; carried to the save so the server can persist it.
  const [generationId, setGenerationId] = useState<string | undefined>(undefined);
  const [draftRestored, setDraftRestored] = useState(false);

  const { requireAuth, promptSignIn } = useAuthGate();

  // Restored after mount: the server pass has no sessionStorage to read.
  useEffect(() => {
    const draft = takeSessionDraft<AiWizardDraft>(DRAFT_KEYS.createAi);
    if (draft) {
      setSubStep(draft.subStep);
      setPrompt(draft.prompt);
      setNote(draft.note);
      setQuestions(draft.questions);
      setAnswers(draft.answers);
      setResult(draft.result);
      setGenerationId(draft.generationId);
    }
    setDraftRestored(true);
  }, []);

  // The call to replay if the API turns out to want a session. Set on every attempt, so a 401 from
  // an expired session reopens the dialog for the RIGHT call rather than the first one ever made.
  const replayRef = useRef<(() => void) | null>(null);

  const { loading, error, setError, fetchQuestions, generate } = useAiGeneration({
    onUnauthorized: () => {
      const replay = replayRef.current;
      if (replay) promptSignIn(replay, { reason: SIGN_IN_REASON });
    },
  });

  useSessionDraft<AiWizardDraft>(DRAFT_KEYS.createAi, () => ({
    subStep,
    prompt,
    note,
    questions,
    answers,
    result,
    generationId,
  }));

  const entry = systemRegistry[pack.slug];
  const promptReady = prompt.trim().length >= MIN_PROMPT;
  // No question is a legitimate outcome: a prompt that already states class, species, background and
  // level leaves nothing to ask. Requiring `length > 0` dead-ended that wizard on a screen with the
  // interpretation note and a disabled button, with no way forward.
  const allQuestionsAnswered = questions.every((q) => (answers[q.id] ?? '').trim().length > 0);

  // Asks for the session BEFORE spending the round trip, and keeps the 401 path as the safety net
  // for a session that expired while the page sat open.
  const gate = (action: () => void) => {
    replayRef.current = action;
    requireAuth(action, { reason: SIGN_IN_REASON });
  };

  const runFetchQuestions = async () => {
    const res = await fetchQuestions({ packId: pack.id, prompt: prompt.trim() });
    if (!res) return;
    setGenerationId(res.generationId);
    setNote(res.note);
    setQuestions(res.questions);
    setAnswers({});
    setSubStep('questions');
  };

  const handleFetchQuestions = () => {
    if (!promptReady) return;
    gate(() => void runFetchQuestions());
  };

  const runGenerate = async () => {
    const answerList = questions
      .map((q) => {
        const answer = (answers[q.id] ?? '').trim();
        // An answer that is not one of the offered options was typed by hand; the server only ever
        // reports THOSE back as unusable, since an option it wrote itself is always usable.
        return { question: q.question, answer, typed: !q.options.includes(answer) };
      })
      .filter((a) => a.answer.length > 0);
    const res = await generate({
      packId: pack.id,
      prompt: prompt.trim(),
      answers: answerList,
      generationId,
    });
    if (!res) return;
    setResult(res);
    setSubStep('review');
  };

  const handleGenerate = () => gate(() => void runGenerate());

  const delegatesToEditor = subStep === 'review' && !!result && !!entry;

  // `undefined` hands the bar over to the draft editor; `null` hides it while a model call is in
  // flight, where there is nothing to go back to or continue with.
  useStepActions(
    delegatesToEditor
      ? undefined
      : loading
        ? null
        : subStep === 'prompt'
          ? { onBack: onExit, onContinue: handleFetchQuestions, canContinue: promptReady }
          : {
              onBack: () => {
                setError(null);
                setSubStep('prompt');
              },
              onContinue: handleGenerate,
              canContinue: allQuestionsAnswered,
              continueLabel: 'Gerar ficha',
              continueIcon: 'none',
            }
  );

  // Held for the one tick the draft takes to read: a restored wizard must not paint the empty prompt
  // step first and then jump to the questions it already has.
  if (!draftRestored) return <LoadingState />;

  // Review: hand the generated draft to the system's editor for adjust + save.
  if (delegatesToEditor && result && entry) {
    const Editor = entry.editor;
    return (
      <Editor
        pack={pack}
        onBack={onExit}
        initialData={result.draft}
        aiDecisions={result.meta.decisions}
        aiSpellNotes={result.meta.spellNotes}
        aiBanner={<AiSummaryBanner result={result} />}
        generationId={result.generationId}
      />
    );
  }

  const headerTitle = loading
    ? subStep === 'prompt'
      ? 'A IA está pensando'
      : 'Forjando sua ficha'
    : subStep === 'prompt'
      ? 'Descreva seu personagem'
      : 'Afine os detalhes';

  const headerSubtitle = loading
    ? subStep === 'prompt'
      ? 'Interpretando seu conceito para fazer as perguntas certas'
      : 'Cada escolha sai das regras do sistema, nada é inventado'
    : subStep === 'prompt'
      ? 'Conte sua ideia em poucas linhas e a IA monta a ficha completa'
      : 'Suas respostas guiam as escolhas da ficha';

  return (
    <>
      <div className="mb-8 text-center">
        <div className="mb-4 flex justify-center">
          <Sparkles className="h-12 w-12 text-primary" aria-hidden="true" />
        </div>
        <h1 className="font-serif text-3xl font-bold text-foreground text-balance">
          {headerTitle}
        </h1>
        <p className="mt-2 text-muted-foreground">{headerSubtitle}</p>
      </div>

      <div className="mx-auto w-full max-w-2xl pb-24">
        {loading ? (
          <AiThinking phrases={subStep === 'prompt' ? THINKING_PHRASES : FORGING_PHRASES} />
        ) : subStep === 'prompt' ? (
          <PromptStep
            prompt={prompt}
            onPromptChange={(value) => {
              setPrompt(value);
              if (error) setError(null);
            }}
            error={error}
          />
        ) : (
          <QuestionsStep
            note={note}
            questions={questions}
            answers={answers}
            onAnswer={(id, value) => setAnswers((prev) => ({ ...prev, [id]: value }))}
            error={error}
          />
        )}
      </div>
    </>
  );
}

function PromptStep({
  prompt,
  onPromptChange,
  error,
}: {
  prompt: string;
  onPromptChange: (value: string) => void;
  error: string | null;
}) {
  return (
    <div className="flex flex-col gap-6 content-reveal">
      <div className="rounded-xl border border-border bg-card shadow-sm transition-all focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/30">
        <Textarea
          aria-label="Conceito do personagem"
          value={prompt}
          onChange={(e) => onPromptChange(e.target.value)}
          placeholder="Um caçador de demônios élfico, furtivo e sarcástico, que luta com duas lâminas e conhece um pouco de magia sombria…"
          rows={6}
          className="rounded-xl border-0 bg-transparent p-4 shadow-none focus-visible:border-transparent"
        />
        <div className="flex items-center gap-2 border-t border-border px-4 py-2.5">
          <Feather className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
          <span className="text-xs text-muted-foreground">
            Quanto mais detalhes você der, mais fiel a ficha fica
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Lightbulb className="h-3.5 w-3.5" aria-hidden="true" />
          Precisa de ideias? Comece com um exemplo:
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {EXAMPLE_CONCEPTS.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => onPromptChange(example)}
              className="group flex cursor-pointer items-start gap-2.5 rounded-xl border border-border bg-card p-3 text-left transition-all hover:border-primary/40 hover:shadow-md hover:shadow-primary/5"
            >
              <Dices
                className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary/70 transition-colors group-hover:text-primary"
                aria-hidden="true"
              />
              <span className="text-xs leading-relaxed text-muted-foreground transition-colors group-hover:text-foreground">
                {example}
              </span>
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

function QuestionsStep({
  note,
  questions,
  answers,
  onAnswer,
  error,
}: {
  note: string;
  questions: GenerationQuestion[];
  answers: Record<string, string>;
  onAnswer: (id: string, value: string) => void;
  error: string | null;
}) {
  return (
    <div className="flex flex-col gap-5 content-reveal">
      {note.trim() && (
        <div className="relative overflow-hidden rounded-xl border border-primary/25 bg-card p-5">
          <div
            className="pointer-events-none absolute inset-0 bg-linear-to-br from-primary/10 via-transparent to-transparent"
            aria-hidden="true"
          />
          <div className="relative">
            <div className="mb-2.5 flex items-center gap-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Sparkles className="h-4 w-4" aria-hidden="true" />
              </div>
              <span className="text-sm font-semibold text-foreground">
                Como a IA entendeu sua ideia
              </span>
            </div>
            <BrowseMarkdown>{note}</BrowseMarkdown>
          </div>
        </div>
      )}

      {questions.length === 0 && (
        <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
          Seu conceito já traz tudo o que eu precisava, então não tenho nada a perguntar. Pode gerar
          a ficha.
        </div>
      )}

      {questions.map((q, index) => {
        const answered = (answers[q.id] ?? '').trim().length > 0;
        return (
          <div
            key={q.id}
            className={`rounded-xl border bg-card p-4 transition-colors ${
              answered ? 'border-primary/30' : 'border-border'
            }`}
          >
            <div className="mb-3 flex items-center gap-2.5">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                {index + 1}
              </span>
              <p className="text-sm font-medium text-foreground">{q.question}</p>
            </div>
            <QuestionField
              question={q}
              value={answers[q.id] ?? ''}
              onChange={(value) => onAnswer(q.id, value)}
            />
          </div>
        );
      })}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

function QuestionField({
  question,
  value,
  onChange,
}: {
  question: GenerationQuestion;
  value: string;
  onChange: (value: string) => void;
}) {
  // EVERY question accepts a typed answer: the options are the model's guesses at what matters, and
  // a player whose idea is not in the list should not have to pick the closest wrong one.
  //
  // The answer IS the state: a value that is not one of the options is the typed one. Picking an
  // option closes the field and drops what was typed, which is the whole point of picking it (an
  // open textarea under a selected option reads as two answers at once). `customOpen` only covers
  // the moment between opening the field and typing the first character.
  const answerIsTyped = value.trim().length > 0 && !question.options.includes(value);
  const [customOpen, setCustomOpen] = React.useState(answerIsTyped);
  const isCustom = customOpen || answerIsTyped;

  if (question.options.length === 0) {
    return (
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={2}
        className="resize-none"
        placeholder="Sua resposta"
      />
    );
  }
  // A radio list, never wrapping pills: the options are model-written and range from "9" to a full
  // sentence, so a wrapping row landed them side by side on one question and stacked on the next, with
  // ragged widths and the selection carried only by a border. Rows are equal-width and aligned; a
  // question whose options are ALL short (levels, "Sim"/"Não") lays them out in a grid instead, since
  // five full-width rows holding one digit each is a lot of page for very little content. The choice is
  // per question, so it is never ragged inside one.
  const compact = question.options.every((option) => option.length <= 14);
  return (
    <div
      className={compact ? 'grid grid-cols-2 gap-2 sm:grid-cols-3' : 'flex flex-col gap-2'}
      role="radiogroup"
      aria-label={question.question}
    >
      {question.options.map((option, index) => {
        const selected = value === option;
        return (
          <button
            // Indexed on purpose: the label comes from the model, so it is not guaranteed unique.
            key={`${index}-${option}`}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => {
              setCustomOpen(false);
              onChange(selected ? '' : option);
            }}
            className={`group flex w-full cursor-pointer gap-3 rounded-lg border p-3 text-left transition-all ${
              compact ? 'items-center' : 'items-start'
            } ${
              selected
                ? 'border-primary bg-primary/10 shadow-sm'
                : 'border-border bg-background hover:border-primary/40 hover:bg-muted/40'
            }`}
          >
            <span
              className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                compact ? '' : 'mt-0.5'
              } ${
                selected
                  ? 'border-primary'
                  : 'border-muted-foreground/40 group-hover:border-primary/50'
              }`}
              aria-hidden="true"
            >
              <span
                className={`h-2 w-2 rounded-full bg-primary transition-transform ${
                  selected ? 'scale-100' : 'scale-0'
                }`}
              />
            </span>
            <span
              className={`text-sm leading-snug ${
                selected
                  ? 'font-medium text-foreground'
                  : 'text-muted-foreground group-hover:text-foreground'
              }`}
            >
              {option}
            </span>
          </button>
        );
      })}
      <button
        type="button"
        role="radio"
        aria-checked={isCustom}
        onClick={() => {
          setCustomOpen(true);
          if (!isCustom) onChange('');
        }}
        className={`group flex w-full cursor-pointer items-center gap-3 rounded-lg border border-dashed p-3 text-left transition-all ${
          compact ? 'col-span-full' : ''
        } ${
          isCustom
            ? 'border-primary bg-primary/10'
            : 'border-border bg-background hover:border-primary/40 hover:bg-muted/40'
        }`}
      >
        <Pencil
          className={`h-4 w-4 shrink-0 ${isCustom ? 'text-primary' : 'text-muted-foreground/60 group-hover:text-primary/60'}`}
          aria-hidden="true"
        />
        <span
          className={`text-sm leading-snug ${
            isCustom
              ? 'font-medium text-foreground'
              : 'text-muted-foreground group-hover:text-foreground'
          }`}
        >
          Escrever minha própria resposta
        </span>
      </button>
      {isCustom && (
        <div className={compact ? 'col-span-full' : ''}>
          <Textarea
            autoFocus
            value={answerIsTyped ? value : ''}
            onChange={(e) => onChange(e.target.value)}
            rows={2}
            className="resize-none"
            placeholder="Sua resposta"
          />
        </div>
      )}
    </div>
  );
}

function AiThinking({ phrases }: { phrases: string[] }) {
  const [phraseIndex, setPhraseIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setPhraseIndex((i) => (i + 1) % phrases.length), 2000);
    return () => clearInterval(id);
  }, [phrases.length]);

  return (
    <div className="flex flex-col items-center gap-6 py-20 text-center animate-in fade-in duration-500">
      <div className="relative">
        <div
          className="absolute -inset-3 animate-pulse rounded-full bg-primary/15 blur-xl"
          aria-hidden="true"
        />
        <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl border border-primary/30 bg-primary/10">
          <Anvil className="h-7 w-7 animate-pulse text-primary" aria-hidden="true" />
        </div>
      </div>
      <p
        key={phraseIndex}
        className="text-sm font-medium text-foreground animate-in fade-in slide-in-from-bottom-1 duration-500"
      >
        {phrases[phraseIndex]}
      </p>
    </div>
  );
}

function AiSummaryBanner({ result }: { result: GenerateCharacterResponse }) {
  const { meta } = result;
  const identityLine = useMemo(
    () => [meta.raceName, meta.className, meta.backgroundName].filter(Boolean).join(' · '),
    [meta.raceName, meta.className, meta.backgroundName]
  );
  return (
    <div className="relative overflow-hidden rounded-xl border border-primary/25 bg-card p-5">
      <div
        className="pointer-events-none absolute inset-0 bg-linear-to-br from-primary/10 via-transparent to-transparent"
        aria-hidden="true"
      />
      <div className="relative">
        <div className="mb-2.5 flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Sparkles className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="truncate font-serif text-lg font-bold text-foreground">
              {meta.name || 'Personagem gerado'}
            </p>
            {identityLine && (
              <p className="truncate text-xs text-muted-foreground">{identityLine}</p>
            )}
          </div>
        </div>
        {meta.summary && <BrowseMarkdown>{meta.summary}</BrowseMarkdown>}
        {meta.adjustments.length > 0 && (
          // What the server had to change relative to the request. Repairing silently reads as the
          // app ignoring the user: they ask for level 30, get 20, and never learn why.
          <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
            <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-400">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              Ajustes que precisei fazer
            </p>
            <ul className="space-y-1 text-xs text-muted-foreground">
              {meta.adjustments.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </div>
        )}
        <p className="mt-2.5 text-xs text-muted-foreground">
          Os marcadores{' '}
          <span
            className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-primary align-text-bottom text-[9px] font-black leading-none text-primary-foreground"
            aria-hidden="true"
          >
            !
          </span>{' '}
          na ficha explicam cada escolha da IA e somem depois de lidos. Tudo pode ser alterado, e
          nada é salvo até você clicar em Salvar Ficha.
        </p>
      </div>
    </div>
  );
}
