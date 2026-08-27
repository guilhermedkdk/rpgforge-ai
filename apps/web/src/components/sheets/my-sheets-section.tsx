'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import Link from 'next/link';
import { Plus, Scroll } from 'lucide-react';
import { characterSheetsApi } from '@/lib/api/character-sheets';
import { packsApi } from '@/lib/api/packs';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { LoadingState } from '@/components/ui/loading-state';
import { SheetListCard } from './sheet-list-card';

export const MySheetsSection = () => {
  const {
    data: sheets = [],
    isLoading: sheetsLoading,
    isError: sheetsError,
    error: sheetsErr,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ['character-sheets', 'list'],
    queryFn: () => characterSheetsApi.list(),
  });

  const { data: packs = [], isLoading: packsLoading } = useQuery({
    queryKey: ['packs'],
    queryFn: packsApi.getAll,
  });

  const packById = useMemo(() => {
    const m = new Map<string, { name: string; slug: string }>();
    for (const p of packs) {
      m.set(p.id, { name: p.name, slug: p.slug });
    }
    return m;
  }, [packs]);

  const isLoading = sheetsLoading || (sheets.length > 0 && packsLoading);

  // The API's `message` is dev-facing (and in English): messages are chosen here, by status
  const sheetsErrorMessage =
    isAxiosError(sheetsErr) && sheetsErr.response?.status === 401
      ? 'Sua sessão expirou. Faça login novamente.'
      : 'Verifique sua conexão e tente novamente.';

  return (
    <>
      {sheetsError ? (
        <ErrorState
          className="content-reveal"
          title="Não foi possível carregar suas fichas."
          description={sheetsErrorMessage}
          onRetry={() => void refetch()}
          isRetrying={isFetching}
        />
      ) : isLoading ? (
        <LoadingState />
      ) : sheets.length === 0 ? (
        <EmptyState
          className="content-reveal"
          icon={Scroll}
          title="Você ainda não forjou nenhuma ficha"
          description="Comece sua jornada criando seu primeiro personagem. Use a IA para gerar um herói único ou crie do zero."
          action={
            <Button asChild size="sm">
              <Link href="/create">
                <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
                Criar Ficha
              </Link>
            </Button>
          }
        />
      ) : (
        <ul className="grid list-none gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3 content-reveal">
          {sheets.map((sheet) => {
            const pack = packById.get(sheet.packId);
            return (
              <li key={sheet.id} className="min-w-0">
                <SheetListCard
                  sheet={sheet}
                  packName={pack?.name ?? null}
                  packSlug={pack?.slug ?? null}
                />
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
};
