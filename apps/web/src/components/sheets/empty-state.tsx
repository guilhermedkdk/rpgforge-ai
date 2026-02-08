'use client';

import Link from 'next/link';
import { Scroll, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';

export const EmptyState = () => {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card px-6 py-16 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-icon-bg">
        <Scroll className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
      </div>
      <h3 className="mb-2 font-serif text-xl font-semibold text-foreground">
        Você ainda não forjou nenhuma ficha
      </h3>
      <p className="mb-6 max-w-sm text-sm text-muted-foreground">
        Comece sua jornada criando seu primeiro personagem. Use a IA para gerar um herói único ou
        crie do zero.
      </p>
      <Button asChild size="lg">
        <Link href="/create">
          <Sparkles className="mr-2 h-4 w-4" aria-hidden="true" />
          Criar Minha Primeira Ficha
        </Link>
      </Button>
    </div>
  );
};
