'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Compass, Search } from 'lucide-react';
import { Header } from '@/components/layout/header';
import { SiteFooter } from '@/components/layout/footer';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Input } from '@/components/ui/input';
import { LoadingState } from '@/components/ui/loading-state';
import { PublicSheetCard } from '@/components/sheets/public-sheet-card';
import { publicSheetsApi } from '@/lib/api/public-sheets';
import { packsApi } from '@/lib/api/packs';

const PAGE_SIZE = 24;

export default function ExplorePage() {
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);

  // Typing filters on a pause, not on every keystroke: each one is a query against every published
  // sheet.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQuery(search.trim());
      setPage(0);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [search]);

  const { data: packs } = useQuery({ queryKey: ['packs'], queryFn: packsApi.getAll });
  const packNameById = new Map((packs ?? []).map((p) => [p.id, { name: p.name, slug: p.slug }]));

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['public-sheets', query, page],
    queryFn: () =>
      publicSheetsApi.list({ q: query || undefined, limit: PAGE_SIZE, offset: page * PAGE_SIZE }),
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const lastPage = Math.max(Math.ceil(total / PAGE_SIZE) - 1, 0);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8">
        <div className="mb-6 flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <Compass className="h-6 w-6 text-primary" aria-hidden="true" />
            <h1 className="font-serif text-2xl font-bold text-foreground">Explorar fichas</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Personagens que outros jogadores publicaram. Toda ficha é privada até o autor publicar.
          </p>
        </div>

        <div className="mb-6 relative max-w-md">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por nome do personagem"
            className="pl-9"
            aria-label="Buscar fichas públicas"
          />
        </div>

        {error ? (
          <div className="content-reveal">
            <ErrorState
              title="Não foi possível carregar as fichas"
              description="Verifique sua conexão e tente novamente."
              onRetry={() => void refetch()}
              isRetrying={isFetching}
            />
          </div>
        ) : isLoading ? (
          <LoadingState />
        ) : items.length === 0 ? (
          <div className="content-reveal">
            <EmptyState
              icon={Compass}
              title={query ? 'Nenhuma ficha encontrada' : 'Ainda não há fichas publicadas'}
              description={
                query
                  ? 'Tente outro nome de personagem.'
                  : 'Quando alguém publicar uma ficha, ela aparece aqui. Publique a sua pelo menu da ficha.'
              }
            />
          </div>
        ) : (
          <div className="content-reveal">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((sheet) => {
                const pack = packNameById.get(sheet.packId);
                return (
                  <PublicSheetCard
                    key={sheet.id}
                    sheet={sheet}
                    packName={pack?.name ?? null}
                    packSlug={pack?.slug ?? null}
                  />
                );
              })}
            </div>

            {total > PAGE_SIZE ? (
              <div className="mt-8 flex items-center justify-center gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === 0 || isFetching}
                  onClick={() => setPage((p) => Math.max(p - 1, 0))}
                >
                  Anterior
                </Button>
                <span className="text-xs text-muted-foreground">
                  Página {page + 1} de {lastPage + 1}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= lastPage || isFetching}
                  onClick={() => setPage((p) => Math.min(p + 1, lastPage))}
                >
                  Próxima
                </Button>
              </div>
            ) : null}
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
