'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { useRequireAuth } from '@/contexts/auth-context';
import { Header } from '@/components/layout/header';
import { SiteFooter } from '@/components/layout/footer';
import { Button } from '@/components/ui/button';
import { characterSheetsApi } from '@/lib/api/character-sheets';
import { systemRegistry } from '@/components/systems/registry';
import { LoadingState } from '@/components/ui/loading-state';

export default function SheetPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { ready } = useRequireAuth();

  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ['character-sheet-with-rules', id],
    queryFn: () => characterSheetsApi.getByIdWithRules(id),
    enabled: !!id && ready,
    retry: false,
  });

  // This page OWNS the sheet's state: `SheetManager` snapshots the fetched data on mount and never
  // re-reads it (re-reading could clobber edits in progress). So a cached copy must never outlive the
  // page — with the global `staleTime`, reopening a sheet you just saved would paint the pre-save
  // version and only F5 fixed it. Dropping the entry on unmount makes every open fetch fresh, and doing
  // it here (not on save) means it can never interrupt an editing session.
  useEffect(
    () => () => {
      queryClient.removeQueries({ queryKey: ['character-sheet-with-rules', id] });
    },
    [id, queryClient]
  );

  const loadErrorView = (() => {
    if (!error) return null;
    if (isAxiosError(error) && error.response?.status === 401)
      return {
        title: 'Faça login para visualizar fichas salvas',
        description: 'Sua sessão pode ter expirado. Entre novamente para continuar.',
        showCreateNew: false,
      };
    if (isAxiosError(error) && error.response?.status === 404)
      return {
        title: 'Esta ficha não existe mais',
        description: 'Ela pode ter sido excluída. Volte para Minhas Fichas ou crie uma nova.',
        showCreateNew: true,
      };
    return {
      title: 'Não foi possível carregar a ficha',
      description: 'Verifique sua conexão e tente novamente.',
      showCreateNew: false,
    };
  })();

  const entry = data ? systemRegistry[data.pack.slug] : null;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* The sheet only exists client-side, so the tab gets its name here. React hoists this into
          the head and it replaces the layout's static title; several open sheets stay tellable
          apart, which is the whole point of the route being per-character. */}
      {data?.sheet.name ? <title>{`${data.sheet.name} | RPGForge AI`}</title> : null}
      <Header />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        {loadErrorView ? (
          <div className="flex flex-col items-center justify-center py-24 text-center content-reveal">
            <p className="font-serif text-lg font-semibold text-foreground">
              {loadErrorView.title}
            </p>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              {loadErrorView.description}
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <Button onClick={() => router.push('/sheets')}>Voltar para Minhas Fichas</Button>
              {loadErrorView.showCreateNew ? (
                <Button variant="outline" onClick={() => router.push('/create')}>
                  Criar nova ficha
                </Button>
              ) : null}
            </div>
          </div>
        ) : data && !entry ? (
          <div className="flex flex-col items-center justify-center py-24 text-center content-reveal">
            <p className="font-medium text-foreground">
              O sistema <span className="font-bold">{data.pack.name}</span> ainda não possui uma
              ficha de personagem disponível.
            </p>
            <Button variant="outline" className="mt-4" onClick={() => router.push('/sheets')}>
              Voltar para Minhas Fichas
            </Button>
          </div>
        ) : !ready || isLoading || !data || !entry ? (
          <LoadingState />
        ) : (
          // No `content-reveal` wrapper here: the manager renders a `fixed` action bar, and that
          // animation's transform would make this element its containing block. It animates its own
          // content area instead, same as the create flow's editor.
          entry.renderSheetManager({ sheetId: id, onBack: () => router.push('/sheets'), data })
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
