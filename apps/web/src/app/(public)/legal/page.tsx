'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { BookOpen, ExternalLink, FileText, Scale } from 'lucide-react';
import { Header } from '@/components/layout/header';
import { SiteFooter } from '@/components/layout/footer';
import { LoadingState } from '@/components/ui/loading-state';
import { packsApi } from '@/lib/api/packs';
import { licenseLabel } from '@/lib/license';
import { PackIcon } from '@/components/systems/pack-icon';

// Same pill chip as BackLink: this page's cards are NOT clickable (each carries several real
// outbound links), so the hover feedback belongs on the links themselves.
const chipBase =
  'inline-flex items-center gap-1.5 rounded-full border border-border bg-background/60 px-3 py-1.5 text-xs font-medium';
const chipStatic = `${chipBase} text-muted-foreground`;
const chipLink = `${chipBase} text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`;

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
          <div className="flex flex-col gap-6 content-reveal">
            {enabledPacks.map((pack) => (
              <section
                key={pack.id}
                aria-label={`Licença de ${pack.name}`}
                className="rounded-xl border border-border bg-card p-5"
              >
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-secondary text-muted-foreground">
                    <PackIcon slug={pack.slug} className="h-6 w-6" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="font-serif text-xl font-bold text-foreground">{pack.name}</h2>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {[pack.systemName, `versão ${pack.version}`, pack.publisherName]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                  {pack.licenseUrl ? (
                    <a href={pack.licenseUrl} target="_blank" rel="noreferrer" className={chipLink}>
                      <Scale className="h-3 w-3 shrink-0 text-primary" aria-hidden="true" />
                      {licenseLabel(pack.licenseType)}
                      <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
                    </a>
                  ) : (
                    <span className={chipStatic}>
                      <Scale className="h-3 w-3 shrink-0 text-primary" aria-hidden="true" />
                      {licenseLabel(pack.licenseType)}
                    </span>
                  )}
                </div>

                {pack.description ? (
                  <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                    {pack.description}
                  </p>
                ) : null}

                <blockquote className="mt-4 rounded-lg border-l-2 border-primary/50 bg-muted/30 px-4 py-3 text-sm italic leading-relaxed text-foreground">
                  {pack.attributionText}
                </blockquote>

                <div className="mt-4 flex flex-wrap gap-2">
                  {pack.permalink ? (
                    <a href={pack.permalink} target="_blank" rel="noreferrer" className={chipLink}>
                      <FileText className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
                      Documento original
                      <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
                    </a>
                  ) : null}
                  <Link href={`/library/${encodeURIComponent(pack.slug)}`} className={chipLink}>
                    <BookOpen className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
                    Explorar conteúdo do pacote
                  </Link>
                </div>
              </section>
            ))}
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
