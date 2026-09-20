'use client';

import { useState } from 'react';
import { Swords, Shield, Info } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerClose,
} from '@/components/ui/drawer';
import { packsApi } from '@/lib/api/packs';
import { licenseLabel } from '@/lib/license';
import { systemRegistry } from '@/components/systems/registry';
import { SystemLabel } from '@/components/systems/system-label';
import { ErrorState } from '@/components/ui/error-state';
import { LoadingState } from '@/components/ui/loading-state';
import { cn } from '@/lib/utils';
import type { PackResponse } from '@rpgforce-ai/shared';

interface PackSelectorProps {
  selectedPackId: string | null;
  onSelect: (packId: string) => void;
}

export const PackSelector = ({ selectedPackId, onSelect }: PackSelectorProps) => {
  const [hoveredPack, setHoveredPack] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const {
    data: packs = [],
    isLoading,
    isError,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ['packs'],
    queryFn: packsApi.getAll,
  });

  const handleSelect = (packId: string) => {
    onSelect(packId);
  };

  const handleViewDetails = () => {
    setDrawerOpen(true);
  };

  // Ready systems first: the one the reader can actually pick should not hide under "em breve".
  const orderedPacks = [...packs].sort(
    (a, b) => Number(Boolean(systemRegistry[b.slug])) - Number(Boolean(systemRegistry[a.slug]))
  );
  const activePack = packs.find((p) => p.id === (hoveredPack ?? selectedPackId));
  const selectedPackData = packs.find((p) => p.id === selectedPackId);

  if (isLoading) {
    return <LoadingState />;
  }

  if (isError) {
    return (
      <ErrorState
        title="Não foi possível carregar os sistemas"
        description="Verifique sua conexão e tente novamente."
        onRetry={() => void refetch()}
        isRetrying={isFetching}
      />
    );
  }

  if (packs.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-12 text-center">
        <Shield className="mx-auto mb-4 h-12 w-12 text-muted-foreground/50" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">Nenhum sistema disponível no momento.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col content-reveal">
      <div className="mb-6 shrink-0 text-center">
        <div className="mb-4 flex justify-center">
          <Swords className="h-10 w-10 text-primary-ink" aria-hidden="true" />
        </div>
        <h1 className="font-serif text-3xl font-bold text-foreground text-balance">
          Escolha o Sistema
        </h1>
        <p className="mt-2 text-muted-foreground">
          Selecione o sistema de RPG para criar sua ficha
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-5 lg:grid-rows-1">
        <div className="flex min-h-0 flex-col lg:col-span-3">
          <div className="flex min-h-0 flex-col gap-3 overflow-y-auto pr-1 max-h-[48vh]">
            {orderedPacks.map((pack) => {
              const isSelected = selectedPackId === pack.id;
              const system = systemRegistry[pack.slug];
              const Art = system?.systemArt;
              return (
                <button
                  key={pack.id}
                  type="button"
                  aria-pressed={isSelected}
                  className={cn(
                    'group relative w-full overflow-hidden rounded-xl border bg-card text-left transition-[border-color,box-shadow,opacity] duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                    !system
                      ? 'cursor-not-allowed border-border opacity-50'
                      : isSelected
                        ? 'cursor-pointer border-primary shadow-lg shadow-primary/10 ring-1 ring-primary/40'
                        : 'cursor-pointer border-border hover:border-primary/40 hover:shadow-md hover:shadow-primary/5'
                  )}
                  onClick={() => system && handleSelect(pack.id)}
                  onMouseEnter={() => setHoveredPack(pack.id)}
                  onMouseLeave={() => setHoveredPack(null)}
                >
                  {system && (
                    <div
                      className={cn(
                        'pointer-events-none absolute inset-0 bg-linear-to-br from-primary/10 via-transparent to-transparent transition-opacity duration-300',
                        isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                      )}
                      aria-hidden="true"
                    />
                  )}
                  <div className="relative flex items-center gap-4 px-4 py-5">
                    {Art ? (
                      <Art
                        size="sm"
                        className={cn(
                          'transition-colors duration-300',
                          isSelected
                            ? 'text-primary-ink'
                            : 'text-muted-foreground group-hover:text-primary-ink'
                        )}
                      />
                    ) : (
                      <div className="flex h-12 w-20 shrink-0 items-center justify-center text-muted-foreground/40">
                        <Shield className="h-7 w-7" aria-hidden="true" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <h3 className="font-serif text-base font-semibold text-foreground">
                        {pack.name}
                      </h3>
                      <p className="mt-0.5 line-clamp-1 text-sm text-muted-foreground">
                        {pack.description ?? pack.systemName}
                      </p>
                    </div>
                    {!system && (
                      <span className="hidden shrink-0 text-3xs font-semibold uppercase tracking-widest text-muted-foreground sm:block">
                        Em breve
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
          {selectedPackId && (
            <button
              type="button"
              onClick={handleViewDetails}
              className="mt-4 flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-primary/30 px-3 py-2 text-sm text-primary-ink transition-colors hover:border-primary/50 hover:bg-primary/5 lg:hidden"
              aria-label="Ver detalhes do sistema selecionado"
            >
              <Info className="h-4 w-4 shrink-0" aria-hidden="true" />
              Ver detalhes de {selectedPackData?.name}
            </button>
          )}
        </div>

        <div className="hidden min-h-0 lg:col-span-2 lg:block">
          <div className="overflow-hidden rounded-xl border border-border bg-card lg:sticky lg:top-24">
            {activePack ? (
              <PackPreview pack={activePack} />
            ) : (
              <div className="flex flex-col items-center justify-center px-5 py-10 text-center">
                <Shield className="mb-3 h-10 w-10 text-muted-foreground/40" aria-hidden="true" />
                <p className="text-sm text-muted-foreground">
                  Passe o mouse ou selecione um sistema para ver detalhes
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
        <DrawerContent>
          <DrawerHeader className="text-left">
            <DrawerTitle className="sr-only">Detalhes do sistema</DrawerTitle>
          </DrawerHeader>
          <div className="overflow-y-auto px-4 pb-4">
            {selectedPackData && (
              <div className="overflow-hidden rounded-xl border border-border bg-card">
                <PackPreview pack={selectedPackData} />
              </div>
            )}
          </div>
          <div className="border-t border-border p-4">
            <DrawerClose asChild>
              <Button variant="secondary" className="w-full">
                Fechar
              </Button>
            </DrawerClose>
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
};

// The same shape as the library index card, minus the links: here the reader is choosing, not
// browsing, so the catalogue is a read-out.
const PackPreview = ({ pack }: { pack: PackResponse }) => {
  const system = systemRegistry[pack.slug];
  const Art = system?.systemArt;
  const categories = (system?.libraryCategories ?? []).map((category) => ({
    ...category,
    count: pack.itemCounts?.[category.kind] ?? 0,
  }));

  return (
    <>
      <div className="flex items-center justify-between gap-3 border-b border-primary/15 bg-primary/8 px-5 py-2.5">
        <SystemLabel name={`${pack.systemName} · versão ${pack.version}`} />
        {!system ? (
          <span className="shrink-0 text-3xs font-semibold uppercase tracking-widest text-muted-foreground">
            Ficha em breve
          </span>
        ) : null}
      </div>

      <div className="flex flex-col gap-4 p-5">
        <div className="flex items-start justify-between gap-4">
          <h3 className="font-serif text-xl font-bold text-foreground">{pack.name}</h3>
          {Art ? <Art className="text-primary-ink" /> : null}
        </div>

        <p className="text-sm leading-relaxed text-muted-foreground">
          {pack.description ?? 'Sistema de RPG disponível para criação de fichas.'}
        </p>

        {categories.length > 0 ? (
          <ul
            className="flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-xs text-muted-foreground"
            aria-label="Conteúdo do catálogo"
          >
            {categories.map(({ key, label, count }) => (
              <li key={key}>
                <span className="font-semibold text-foreground tabular-nums">{count}</span> {label}
              </li>
            ))}
          </ul>
        ) : null}

        <p className="border-t border-border/60 pt-3 text-xs text-muted-foreground">
          Conteúdo aberto sob {licenseLabel(pack.licenseType)}
          {pack.publisherName ? ` · ${pack.publisherName}` : ''}
        </p>
      </div>
    </>
  );
};
