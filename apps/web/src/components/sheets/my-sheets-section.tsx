'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import Link from 'next/link';
import { Plus, Scroll, SearchX } from 'lucide-react';
import { characterSheetsApi } from '@/lib/api/character-sheets';
import { packsApi } from '@/lib/api/packs';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { FilterChipRow, type FilterOption } from '@/components/ui/filter-chip-row';
import { FilterPanel } from '@/components/ui/filter-panel';
import { LoadingState } from '@/components/ui/loading-state';
import { OwnedSheetCard } from './owned-sheet-card';

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

  const [query, setQuery] = useState('');
  const [packId, setPackId] = useState<string | null>(null);

  const packById = useMemo(() => {
    const m = new Map<string, { name: string; slug: string }>();
    for (const p of packs) {
      m.set(p.id, { name: p.name, slug: p.slug });
    }
    return m;
  }, [packs]);

  // Counts come from the whole list, not the filtered one, so a chip never zeroes its neighbours.
  const systemOptions: FilterOption[] = useMemo(() => {
    const counts = new Map<string, number>();
    for (const sheet of sheets) counts.set(sheet.packId, (counts.get(sheet.packId) ?? 0) + 1);
    return packs
      .filter((pack) => counts.has(pack.id))
      .map((pack) => ({
        value: pack.id,
        label: pack.name,
        count: counts.get(pack.id) ?? 0,
      }));
  }, [sheets, packs]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return sheets
      .filter((sheet) => !packId || sheet.packId === packId)
      .filter((sheet) => !needle || sheet.name.toLowerCase().includes(needle));
  }, [sheets, query, packId]);

  const handleClearFilters = () => {
    setQuery('');
    setPackId(null);
  };

  const isLoading = sheetsLoading || (sheets.length > 0 && packsLoading);

  // The API's `message` is dev-facing (and in English): messages are chosen here, by status
  const sheetsErrorMessage =
    isAxiosError(sheetsErr) && sheetsErr.response?.status === 401
      ? 'Sua sessão expirou. Faça login novamente.'
      : 'Verifique sua conexão e tente novamente.';

  if (sheetsError) {
    return (
      <ErrorState
        className="content-reveal"
        title="Não foi possível carregar suas fichas."
        description={sheetsErrorMessage}
        onRetry={() => void refetch()}
        isRetrying={isFetching}
      />
    );
  }
  if (isLoading) return <LoadingState />;
  if (sheets.length === 0) {
    return (
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
    );
  }

  return (
    <div className="flex flex-col gap-6 content-reveal">
      <FilterPanel query={query} onQueryChange={setQuery} placeholder="Buscar por nome da ficha">
        <FilterChipRow
          label="Sistema"
          options={systemOptions}
          selected={packId}
          onSelect={setPackId}
          allLabel="Todos"
        />
      </FilterPanel>

      {visible.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title="Nenhuma ficha corresponde"
          description="Nada bate com a busca e os filtros atuais."
          action={
            <Button type="button" variant="outline" size="sm" onClick={handleClearFilters}>
              Limpar filtros
            </Button>
          }
        />
      ) : (
        <ul className="grid list-none gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((sheet) => {
            const pack = packById.get(sheet.packId);
            return (
              <li key={sheet.id} className="min-w-0">
                <OwnedSheetCard
                  showVisibility
                  sheet={sheet}
                  packName={pack?.name ?? null}
                  packSlug={pack?.slug ?? null}
                />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};
