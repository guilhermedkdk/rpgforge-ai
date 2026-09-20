'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Compass, Flame } from 'lucide-react';
import { Header } from '@/components/layout/header';
import { SiteFooter } from '@/components/layout/footer';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { FilterChipRow, type FilterOption } from '@/components/ui/filter-chip-row';
import { FilterPanel } from '@/components/ui/filter-panel';
import { LoadingState } from '@/components/ui/loading-state';
import { PublicSheetCard } from '@/components/sheets/public-sheet-card';
import { publicSheetsApi } from '@/lib/api/public-sheets';
import { packsApi } from '@/lib/api/packs';

const PAGE_SIZE = 24;
const FEATURED_SIZE = 3;
// A ranking of three says nothing about a feed of three, so the strip only appears once there is
// clearly more published than it shows.
const FEATURED_MIN_TOTAL = FEATURED_SIZE * 2;

export default function ExplorePage() {
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [packId, setPackId] = useState<string | null>(null);
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
  const packById = new Map((packs ?? []).map((pack) => [pack.id, pack]));
  const packOf = (sheet: { packId: string }) => ({
    packName: packById.get(sheet.packId)?.name ?? null,
    packSlug: packById.get(sheet.packId)?.slug ?? null,
  });

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['public-sheets', query, packId, page],
    queryFn: () =>
      publicSheetsApi.list({
        q: query || undefined,
        packId: packId ?? undefined,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      }),
  });

  const total = data?.total ?? 0;
  const lastPage = Math.max(Math.ceil(total / PAGE_SIZE) - 1, 0);
  const hasResults = (data?.items.length ?? 0) > 0;

  // The strip is the feed's own ranking, so it stands down whenever the reader is searching for one
  // character in particular.
  const showFeatured = !query && page === 0 && total >= FEATURED_MIN_TOTAL;
  const { data: featuredData } = useQuery({
    queryKey: ['public-sheets', 'featured', packId],
    queryFn: () =>
      publicSheetsApi.list({
        packId: packId ?? undefined,
        sort: 'popular',
        limit: FEATURED_SIZE,
      }),
    enabled: showFeatured,
  });
  // Nothing is "em alta" when nobody saved anything: without this the strip would repeat three
  // arbitrary sheets from the grid below.
  const featured = showFeatured
    ? (featuredData?.items ?? []).filter((sheet) => sheet.favoriteCount > 0)
    : [];
  // The grid drops what the strip is already showing right above it. Only here: further pages are
  // far enough from the strip that removing rows there would cost more than the repetition.
  const featuredIds = new Set(featured.map((sheet) => sheet.id));
  const items = (data?.items ?? []).filter((sheet) => !featuredIds.has(sheet.id));

  const packCounts = data?.packCounts ?? [];
  const countByPack = new Map(packCounts.map((entry) => [entry.packId, entry.count]));
  // Only systems with something published, the busiest first; the selected one stays even when a
  // search empties it, or the filter would have no way back.
  const systemOptions: FilterOption[] = (packs ?? [])
    .filter((pack) => (countByPack.get(pack.id) ?? 0) > 0 || pack.id === packId)
    .sort((a, b) => (countByPack.get(b.id) ?? 0) - (countByPack.get(a.id) ?? 0))
    .map((pack) => ({
      value: pack.id,
      label: pack.name,
      count: countByPack.get(pack.id) ?? 0,
    }));

  const handleSelectPack = (next: string | null) => {
    setPackId(next);
    setPage(0);
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8">
        <div className="mb-6 flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <Compass className="h-6 w-6 text-primary-ink" aria-hidden="true" />
            <h1 className="font-serif text-2xl font-bold text-foreground">Explorar fichas</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Personagens que outros jogadores publicaram. Toda ficha é privada até o autor publicar.
          </p>
        </div>

        <div className="mb-6">
          <FilterPanel
            query={search}
            onQueryChange={setSearch}
            placeholder="Buscar por nome do personagem"
          >
            <FilterChipRow
              label="Sistema"
              options={systemOptions}
              selected={packId}
              onSelect={handleSelectPack}
              allLabel="Todos"
            />
          </FilterPanel>
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
        ) : !hasResults ? (
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
            {showFeatured && featured.length > 0 ? (
              <section className="mb-8" aria-labelledby="explore-featured">
                <div className="mb-3 flex items-center gap-2">
                  <Flame className="h-4 w-4 text-primary-ink" aria-hidden="true" />
                  <h2
                    id="explore-featured"
                    className="font-serif text-sm font-bold uppercase tracking-widest text-foreground"
                  >
                    Em alta
                  </h2>
                  <span className="text-xs text-muted-foreground">as mais salvas</span>
                </div>
                <ul className="grid list-none gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3">
                  {featured.map((sheet, index) => (
                    <li key={sheet.id} className="min-w-0">
                      <PublicSheetCard
                        sheet={sheet}
                        {...packOf(sheet)}
                        variant="featured"
                        rank={index + 1}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <ul className="grid list-none gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((sheet) => (
                <li key={sheet.id} className="min-w-0">
                  <PublicSheetCard sheet={sheet} {...packOf(sheet)} />
                </li>
              ))}
            </ul>

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
