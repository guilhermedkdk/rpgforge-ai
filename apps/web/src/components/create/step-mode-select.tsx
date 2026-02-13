'use client';

import { Sparkles, Pen, Flame } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export type CreationMode = 'ai' | 'manual' | null;

interface StepModeSelectProps {
  selectedMode: CreationMode | null;
  onSelect: (mode: CreationMode) => void;
}

export const StepModeSelect = ({ selectedMode, onSelect }: StepModeSelectProps) => {
  return (
    <>
      <div className="mb-8 text-center">
        <div className="mb-4 flex justify-center">
          <Flame className="h-12 w-12 text-primary" aria-hidden="true" />
        </div>
        <h1 className="font-serif text-3xl font-bold text-foreground text-balance">
          Forjar Nova Ficha
        </h1>
        <p className="mt-2 text-muted-foreground">Escolha como deseja criar seu personagem</p>
      </div>

      <div className="mx-auto grid max-w-3xl grid-cols-1 gap-6 md:grid-cols-2 md:items-stretch">
        <button
          type="button"
          className="h-full w-full text-left transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          onClick={() => onSelect('ai')}
          aria-pressed={selectedMode === 'ai'}
          aria-label="Criar com IA"
        >
          <Card
            className={`group flex h-full cursor-pointer flex-col transition-all ${
              selectedMode === 'ai'
                ? 'border-primary ring-1 ring-primary/30'
                : 'hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5'
            }`}
          >
            <CardHeader className="shrink-0">
              <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 transition-colors group-hover:bg-primary/20">
                <Sparkles className="h-6 w-6 text-primary" aria-hidden="true" />
              </div>
              <CardTitle className="font-serif text-xl">Criar com IA</CardTitle>
              <CardDescription>
                Descreva suas ideias e deixe a inteligência artificial forjar seu personagem.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col pt-0">
              <ul className="mb-4 flex-1 space-y-2 text-sm text-muted-foreground">
                <li className="flex items-center gap-2">
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary"
                    aria-hidden="true"
                  />
                  Geração automática de atributos
                </li>
                <li className="flex items-center gap-2">
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary"
                    aria-hidden="true"
                  />
                  Sugestões de backstory e personalidade
                </li>
                <li className="flex items-center gap-2">
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary"
                    aria-hidden="true"
                  />
                  Otimização para seu sistema de RPG
                </li>
              </ul>
              <span
                className="mt-auto inline-flex h-10 w-full shrink-0 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
                aria-hidden="true"
              >
                <Sparkles className="mr-2 h-4 w-4" aria-hidden="true" />
                Em breve
              </span>
            </CardContent>
          </Card>
        </button>

        <button
          type="button"
          className="h-full w-full text-left transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          onClick={() => onSelect('manual')}
          aria-pressed={selectedMode === 'manual'}
          aria-label="Criar manualmente"
        >
          <Card
            className={`group flex h-full cursor-pointer flex-col transition-all ${
              selectedMode === 'manual'
                ? 'border-primary ring-1 ring-primary/30'
                : 'hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5'
            }`}
          >
            <CardHeader className="shrink-0">
              <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-lg bg-secondary transition-colors group-hover:bg-secondary/80">
                <Pen className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
              </div>
              <CardTitle className="font-serif text-xl">Criar Manualmente</CardTitle>
              <CardDescription>
                Controle total sobre cada detalhe do seu personagem. Preencha cada campo do seu
                jeito.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col pt-0">
              <ul className="mb-4 flex-1 space-y-2 text-sm text-muted-foreground">
                <li className="flex items-center gap-2">
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground"
                    aria-hidden="true"
                  />
                  Liberdade criativa completa
                </li>
                <li className="flex items-center gap-2">
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground"
                    aria-hidden="true"
                  />
                  Formulário guiado passo a passo
                </li>
                <li className="flex items-center gap-2">
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground"
                    aria-hidden="true"
                  />
                  Validação de regras em tempo real
                </li>
              </ul>
              <span
                className="mt-auto inline-flex h-10 w-full shrink-0 items-center justify-center rounded-md border border-input bg-transparent px-4 py-2 text-sm font-medium"
                aria-hidden="true"
              >
                <Pen className="mr-2 h-4 w-4" aria-hidden="true" />
                Em breve
              </span>
            </CardContent>
          </Card>
        </button>
      </div>
    </>
  );
};
