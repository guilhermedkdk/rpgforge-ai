'use client';

import type { LucideIcon } from 'lucide-react';
import {
  BadgeCheck,
  BookOpen,
  Eye,
  Split,
  PenLine,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Zap,
} from 'lucide-react';

export type CreationMode = 'ai' | 'manual';

interface StepModeSelectProps {
  selectedMode: CreationMode;
  onSelect: (mode: CreationMode) => void;
}

interface ModeOption {
  id: CreationMode;
  icon: LucideIcon;
  title: string;
  tagline: string;
  highlights: { icon: LucideIcon; label: string }[];
}

const modes: ModeOption[] = [
  {
    id: 'ai',
    icon: Sparkles,
    title: 'Criar com IA',
    tagline: 'Conte sua ideia e receba a ficha pronta para jogar.',
    highlights: [
      { icon: Zap, label: 'Em minutos' },
      { icon: ShieldCheck, label: 'Fiel às regras' },
      { icon: BookOpen, label: 'História inclusa' },
    ],
  },
  {
    id: 'manual',
    icon: PenLine,
    title: 'Criar Manualmente',
    tagline: 'Monte tudo do seu jeito, escolha por escolha.',
    highlights: [
      { icon: SlidersHorizontal, label: 'Controle total' },
      { icon: Eye, label: 'Editor visual' },
      { icon: BadgeCheck, label: 'Regras validadas' },
    ],
  },
];

export const StepModeSelect = ({ selectedMode, onSelect }: StepModeSelectProps) => {
  return (
    <>
      <div className="mb-8 text-center">
        <div className="mb-4 flex justify-center">
          <Split className="h-12 w-12 text-primary" aria-hidden="true" />
        </div>
        <h1 className="font-serif text-3xl font-bold text-foreground text-balance">
          Como você quer forjar?
        </h1>
        <p className="mt-2 text-muted-foreground">Dois caminhos, a mesma ficha completa no final</p>
      </div>

      <div className="mx-auto grid w-full max-w-4xl grid-cols-1 gap-6 md:grid-cols-2 content-reveal">
        {modes.map((mode) => {
          const ModeIcon = mode.icon;
          const isSelected = selectedMode === mode.id;
          return (
            <button
              key={mode.id}
              type="button"
              onClick={() => onSelect(mode.id)}
              aria-pressed={isSelected}
              className={`group relative flex cursor-pointer flex-col overflow-hidden rounded-xl border bg-card p-6 text-left transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:min-h-[280px] ${
                isSelected
                  ? 'border-primary shadow-lg shadow-primary/10 ring-1 ring-primary/40'
                  : 'border-border hover:border-primary/40 hover:shadow-md hover:shadow-primary/5'
              }`}
            >
              <div
                className={`pointer-events-none absolute inset-0 bg-linear-to-br from-primary/10 via-transparent to-transparent transition-opacity duration-300 ${
                  isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                }`}
                aria-hidden="true"
              />
              <div
                className={`relative flex h-12 w-12 items-center justify-center rounded-xl transition-colors ${
                  isSelected
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-secondary text-muted-foreground'
                }`}
              >
                <ModeIcon className="h-6 w-6" aria-hidden="true" />
              </div>

              <div className="relative pt-6">
                <h2 className="font-serif text-2xl font-bold text-foreground">{mode.title}</h2>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  {mode.tagline}
                </p>
              </div>

              <div className="relative mt-auto pt-5">
                <div className="flex flex-wrap gap-2">
                  {mode.highlights.map((highlight) => {
                    const HighlightIcon = highlight.icon;
                    return (
                      <span
                        key={highlight.label}
                        className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background/60 px-2.5 py-1 text-xs text-muted-foreground"
                      >
                        <HighlightIcon className="h-3 w-3 text-primary" aria-hidden="true" />
                        {highlight.label}
                      </span>
                    );
                  })}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </>
  );
};
