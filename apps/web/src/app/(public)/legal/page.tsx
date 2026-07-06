'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ExternalLink, Scale } from 'lucide-react';
import { Header } from '@/components/layout/header';
import { SiteFooter } from '@/components/layout/footer';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LoadingState } from '@/components/ui/loading-state';
import { packsApi } from '@/lib/api/packs';
import { licenseLabel } from '@/lib/license';

export default function LegalPage() {
  const { data: packs = [], isLoading } = useQuery({
    queryKey: ['packs'],
    queryFn: packsApi.getAll,
  });

  const enabledPacks = packs.filter((p) => p.isEnabled);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">
        <div className="mb-6 flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <Scale className="h-6 w-6 text-primary" aria-hidden="true" />
            <h1 className="font-serif text-2xl font-bold text-foreground">
              Licenças e Atribuições
            </h1>
          </div>
          <p className="text-sm text-muted-foreground">
            O RPGForge AI utiliza exclusivamente conteúdo de regras publicado sob licenças abertas.
            Todo o material exibido na{' '}
            <Link href="/library" className="text-primary hover:underline">
              Biblioteca de Regras
            </Link>{' '}
            e nas fichas de personagem provém dos pacotes listados abaixo, com a atribuição exigida
            por cada licença.
          </p>
        </div>

        {isLoading ? (
          <LoadingState />
        ) : (
          <div className="flex flex-col gap-6">
            {enabledPacks.map((pack) => (
              <Card key={pack.id} className="border-border bg-card">
                <CardHeader className="gap-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle className="font-serif text-xl text-foreground">
                      {pack.name}
                    </CardTitle>
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
                <CardContent className="flex flex-col gap-4">
                  {pack.description ? (
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {pack.description}
                    </p>
                  ) : null}
                  <blockquote className="border-l-2 border-primary/50 bg-muted/30 px-4 py-3 text-sm italic leading-relaxed text-foreground">
                    {pack.attributionText}
                  </blockquote>
                  <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
                    {pack.permalink ? (
                      <a
                        href={pack.permalink}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-primary hover:underline"
                      >
                        Documento original
                        <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                      </a>
                    ) : null}
                    <Link
                      href={`/library/${encodeURIComponent(pack.slug)}`}
                      className="text-primary hover:underline"
                    >
                      Explorar conteúdo do pacote
                    </Link>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
