'use client';

import { useState } from 'react';
import { Swords, Shield, Info } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerClose,
} from '@/components/ui/drawer';
import { packsApi } from '@/lib/api/packs';
import { systemRegistry } from '@/components/systems/registry';
import { PackIcon } from '@/components/systems/pack-icon';
import { ErrorState } from '@/components/ui/error-state';
import { LoadingState } from '@/components/ui/loading-state';
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
            {packs.map((pack) => {
              const isSelected = selectedPackId === pack.id;
              const isSupported = !!systemRegistry[pack.slug];
              return (
                <button
                  key={pack.id}
                  type="button"
                  aria-pressed={isSelected}
                  className={`group relative w-full overflow-hidden rounded-xl border bg-card text-left transition-[border-color,box-shadow,opacity] duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                    !isSupported
                      ? 'cursor-not-allowed border-border opacity-50'
                      : isSelected
                        ? 'cursor-pointer border-primary shadow-lg shadow-primary/10 ring-1 ring-primary/40'
                        : 'cursor-pointer border-border hover:border-primary/40 hover:shadow-md hover:shadow-primary/5'
                  }`}
                  onClick={() => isSupported && handleSelect(pack.id)}
                  onMouseEnter={() => setHoveredPack(pack.id)}
                  onMouseLeave={() => setHoveredPack(null)}
                >
                  {isSupported && (
                    <div
                      className={`pointer-events-none absolute inset-0 bg-linear-to-br from-primary/10 via-transparent to-transparent transition-opacity duration-300 ${
                        isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                      }`}
                      aria-hidden="true"
                    />
                  )}
                  <div className="relative flex items-center gap-4 px-4 py-6">
                    <div
                      className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl transition-colors ${
                        isSelected
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-secondary text-muted-foreground'
                      }`}
                    >
                      <PackIcon slug={pack.slug} className="h-6 w-6" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-serif text-base font-semibold text-foreground">
                        {pack.name}
                      </h3>
                      <p className="mt-0.5 line-clamp-1 text-sm text-muted-foreground">
                        {pack.description ?? pack.systemName}
                      </p>
                    </div>
                    {!isSupported && (
                      <div className="hidden shrink-0 sm:flex">
                        <Badge variant="outline" className="text-xs text-muted-foreground">
                          Em breve
                        </Badge>
                      </div>
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
          <div className="rounded-lg border border-border bg-card p-5 lg:sticky lg:top-24">
            {activePack ? (
              <PackPreview pack={activePack} />
            ) : (
              <div className="flex flex-col items-center justify-center py-10 text-center">
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
            {selectedPackData && <PackPreview pack={selectedPackData} />}
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

const PackPreview = ({ pack }: { pack: PackResponse }) => {
  const isSupported = !!systemRegistry[pack.slug];
  return (
    <>
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary-ink">
          <PackIcon slug={pack.slug} className="h-6 w-6" />
        </div>
        <div>
          <h3 className="font-serif text-lg font-bold text-foreground">{pack.name}</h3>
          <p className="text-xs text-muted-foreground">
            {pack.systemName} • v{pack.version}
          </p>
        </div>
      </div>

      <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
        {pack.description ?? 'Sistema de RPG disponível para criação de fichas.'}
      </p>

      <div className="flex flex-wrap gap-1.5">
        <Badge variant="secondary" className="text-xs">
          {pack.systemName}
        </Badge>
        <Badge variant="outline" className="bg-transparent text-xs">
          v{pack.version}
        </Badge>
        {!isSupported && (
          <Badge variant="outline" className="text-xs text-muted-foreground">
            Ficha em breve
          </Badge>
        )}
      </div>
    </>
  );
};
