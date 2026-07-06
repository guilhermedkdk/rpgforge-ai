'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { BookOpen, ChevronRight, ExternalLink, Library } from 'lucide-react';
import { Header } from '@/components/layout/header';
import { SiteFooter } from '@/components/layout/footer';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { LoadingState } from '@/components/ui/loading-state';
import { packsApi } from '@/lib/api/packs';
import { licenseLabel } from '@/lib/license';
import { systemRegistry } from '@/components/systems/registry';
import type { PackResponse } from '@rpgforce-ai/shared';

function SystemCard({ pack }: { pack: PackResponse }) {
  const hasLibrary = Boolean(systemRegistry[pack.slug]);

  return (
    <Card className="flex h-full flex-col border-border bg-card">
      <CardHeader className="gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="font-serif text-xl text-foreground">{pack.name}</CardTitle>
          {pack.licenseUrl ? (
            <a href={pack.licenseUrl} target="_blank" rel="noreferrer">
              <Badge className="gap-1">
                {licenseLabel(pack.licenseType)}
                <ExternalLink className="h-3 w-3" aria-hidden="true" />
              </Badge>
            </a>
          ) : (
            <Badge>{licenseLabel(pack.licenseType)}</Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          {pack.systemName} · versão {pack.version}
          {pack.publisherName ? ` · ${pack.publisherName}` : ''}
        </p>
      </CardHeader>
      {pack.description ? (
        <CardContent className="flex-1">
          <p className="text-sm leading-relaxed text-muted-foreground">{pack.description}</p>
        </CardContent>
      ) : (
        <div className="flex-1" />
      )}
      <CardFooter className="justify-end">
        {hasLibrary ? (
          <Button asChild>
            <Link href={`/library/${encodeURIComponent(pack.slug)}`}>
              <BookOpen className="mr-2 h-4 w-4" aria-hidden="true" />
              Explorar regras
              <ChevronRight className="ml-1 h-4 w-4" aria-hidden="true" />
            </Link>
          </Button>
        ) : (
          <Badge variant="outline">Em breve</Badge>
        )}
      </CardFooter>
    </Card>
  );
}

export default function LibraryPage() {
  const {
    data: packs = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({ queryKey: ['packs'], queryFn: packsApi.getAll });

  const enabledPacks = packs.filter((p) => p.isEnabled);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8">
        <div className="mb-6 flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <Library className="h-6 w-6 text-primary" aria-hidden="true" />
            <h1 className="font-serif text-2xl font-bold text-foreground">
              Biblioteca de Sistemas
            </h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Explore as regras, magias, itens e classes de cada sistema disponível no RPGForge. Todo
            o conteúdo vem de documentos de referência abertos. Veja as{' '}
            <Link href="/legal" className="text-primary hover:underline">
              licenças e atribuições
            </Link>
            .
          </p>
        </div>

        {isLoading ? (
          <LoadingState />
        ) : isError ? (
          <div className="flex flex-col items-center gap-4 py-24 text-center">
            <p className="font-serif text-lg font-semibold text-foreground">
              Não foi possível carregar os sistemas
            </p>
            <p className="max-w-md text-sm text-muted-foreground">
              Verifique sua conexão e tente novamente.
            </p>
            <Button variant="outline" onClick={() => void refetch()}>
              Tentar novamente
            </Button>
          </div>
        ) : enabledPacks.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border px-6 py-16 text-center">
            <p className="text-sm text-muted-foreground">Nenhum sistema disponível no momento.</p>
          </div>
        ) : (
          <ul className="grid list-none gap-6 p-0 md:grid-cols-2 lg:grid-cols-3">
            {enabledPacks.map((pack) => (
              <li key={pack.id} className="min-w-0">
                <SystemCard pack={pack} />
              </li>
            ))}
          </ul>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
