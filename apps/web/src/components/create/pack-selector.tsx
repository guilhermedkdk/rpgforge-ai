'use client';

import { useState } from 'react';
import { Swords, Shield, Info } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerClose,
} from '@/components/ui/drawer';
import { packsApi } from '@/lib/api/packs';
import type { PackResponse } from '@rpgforce-ai/shared';

const packIcons: Record<string, React.ReactNode> = {
  'dnd-srd-5-2': <Swords className="h-6 w-6" />,
  default: <Shield className="h-6 w-6" />,
};

const getPackIcon = (slug: string): React.ReactNode => {
  return packIcons[slug] ?? packIcons.default;
};

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
    error,
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
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <p className="mt-4 text-sm text-muted-foreground">Carregando sistemas disponíveis...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-6 text-center">
        <p className="text-sm text-destructive">
          Não foi possível carregar os sistemas. Tente novamente.
        </p>
      </div>
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
    <div className="flex flex-col">
      <div className="mb-6 shrink-0 text-center">
        <div className="mb-4 flex justify-center">
          <Swords className="h-10 w-10 text-primary" aria-hidden="true" />
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
            {Array.from({ length: 5 }, () => packs)
              .flat()
              .map((pack, index) => {
                const isSelected = selectedPackId === pack.id;
                return (
                  <button
                    key={`${pack.id}-${index}`}
                    type="button"
                    className="w-full text-left transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    onClick={() => handleSelect(pack.id)}
                    onMouseEnter={() => setHoveredPack(pack.id)}
                    onMouseLeave={() => setHoveredPack(null)}
                  >
                    <Card
                      className={`cursor-pointer transition-all ${
                        isSelected
                          ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                          : 'hover:border-primary/30 hover:bg-card/80'
                      }`}
                    >
                      <CardContent className="flex items-center gap-4 p-4">
                        <div
                          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-lg transition-colors ${
                            isSelected
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-secondary text-muted-foreground'
                          }`}
                        >
                          {getPackIcon(pack.slug)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <h3 className="font-serif text-base font-semibold text-foreground">
                            {pack.name}
                          </h3>
                          <p className="mt-0.5 line-clamp-1 text-sm text-muted-foreground">
                            {pack.description ?? pack.systemName}
                          </p>
                        </div>
                        <div className="hidden shrink-0 sm:flex">
                          {isSelected ? (
                            <Badge variant="default" className="text-xs">
                              Selecionado
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="text-xs">
                              {pack.systemName}
                            </Badge>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  </button>
                );
              })}
          </div>
          {selectedPackId && (
            <button
              type="button"
              onClick={handleViewDetails}
              className="mt-4 flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-primary/30 px-3 py-2 text-sm text-primary transition-colors hover:border-primary/50 hover:bg-primary/5 lg:hidden"
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
  return (
    <>
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          {getPackIcon(pack.slug)}
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
      </div>
    </>
  );
};
