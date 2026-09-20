'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Library } from 'lucide-react';
import type { PackResponse } from '@rpgforce-ai/shared';
import { Header } from '@/components/layout/header';
import { SiteFooter } from '@/components/layout/footer';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { FILTER_CHIP_CLASS, FILTER_CHIP_IDLE } from '@/components/ui/filter-chip';
import { LoadingState } from '@/components/ui/loading-state';
import { packsApi } from '@/lib/api/packs';
import { licenseLabel } from '@/lib/license';
import { systemRegistry } from '@/components/systems/registry';
import { SystemLabel } from '@/components/systems/system-label';
import { cn } from '@/lib/utils';

/**
 * One rule system. The card is not a link: its categories are, each straight into that section of
 * the catalogue, so the reader picks "Spells" here rather than opening the pack and picking again.
 */
const SystemCard = ({ pack }: { pack: PackResponse }) => {
  const system = systemRegistry[pack.slug];
  const Art = system?.systemArt;
  const catalogHref = `/library/${encodeURIComponent(pack.slug)}`;
  const meta = [pack.systemName, `versão ${pack.version}`, pack.publisherName]
    .filter(Boolean)
    .join(' · ');
  const categories = (system?.libraryCategories ?? []).map((category) => ({
    ...category,
    count: pack.itemCounts?.[category.kind] ?? 0,
  }));

  return (
    <article
      // A pack with no catalogue has nothing to fill a tall card with, so it keeps its own height
      // instead of stretching hollow to match a ready one beside it.
      className={cn(
        'relative flex flex-col overflow-hidden rounded-xl border border-border bg-card',
        system ? 'h-full' : 'opacity-70'
      )}
    >
      <div className="flex items-center justify-between gap-3 border-b border-primary/15 bg-primary/8 px-6 py-2.5">
        <SystemLabel name={meta} />
        {!system ? (
          <span className="shrink-0 text-3xs font-semibold uppercase tracking-widest text-muted-foreground">
            Em breve
          </span>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-5 p-6">
        <div className="flex items-start justify-between gap-6">
          <div className="min-w-0">
            <h2 className="font-serif text-2xl font-bold text-foreground">
              {system ? (
                <Link
                  href={catalogHref}
                  className="rounded-sm hover:text-primary-ink focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
                >
                  {pack.name}
                </Link>
              ) : (
                pack.name
              )}
            </h2>
            {pack.description ? (
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                {pack.description}
              </p>
            ) : null}
          </div>
          {Art ? <Art className="hidden shrink-0 text-primary-ink sm:block" /> : null}
        </div>

        {categories.length > 0 ? (
          <ul
            className="flex list-none flex-wrap gap-1.5 p-0"
            aria-label={`Catálogo de ${pack.name}`}
          >
            {categories.map(({ key, label, icon: Icon, count }) => (
              <li key={key}>
                <Link
                  href={`${catalogHref}?cat=${key}`}
                  className={cn(
                    FILTER_CHIP_CLASS,
                    FILTER_CHIP_IDLE,
                    'inline-flex items-center gap-1.5'
                  )}
                >
                  <Icon className="h-3 w-3" aria-hidden="true" />
                  {label}
                  <span className="font-normal tabular-nums opacity-70">{count}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Catálogo em preparação.</p>
        )}

        <div className="mt-auto flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-t border-border/60 pt-4 text-xs text-muted-foreground">
          <span className="min-w-0 truncate">
            Conteúdo aberto sob {licenseLabel(pack.licenseType)}
            {pack.publisherName ? ` · ${pack.publisherName}` : ''}
            {' · '}
            <Link href="/legal" className="text-primary-ink hover:underline">
              atribuição
            </Link>
          </span>
          {/* The one action on the card, and a solid button for it: the category chips above are
              shortcuts, this is the door. */}
          {system ? (
            <Button asChild className="shrink-0">
              <Link href={catalogHref} aria-label={`Abrir o catálogo de ${pack.name}`}>
                Abrir catálogo
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
          ) : null}
        </div>
      </div>
    </article>
  );
};

export default function LibraryPage() {
  const {
    data: packs = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({ queryKey: ['packs'], queryFn: packsApi.getAll });

  // Ready catalogues first: the reader came to open one, not to read what is coming.
  const enabledPacks = packs
    .filter((p) => p.isEnabled)
    .sort(
      (a, b) => Number(Boolean(systemRegistry[b.slug])) - Number(Boolean(systemRegistry[a.slug]))
    );

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8">
        <div className="mb-6 flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <Library className="h-6 w-6 text-primary-ink" aria-hidden="true" />
            <h1 className="font-serif text-2xl font-bold text-foreground">
              Biblioteca de Sistemas
            </h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Explore as regras, magias, itens e classes de cada sistema disponível no RPGForge. Todo
            o conteúdo vem de documentos de referência abertos. Veja as{' '}
            <Link href="/legal" className="text-primary-ink hover:underline">
              licenças e atribuições
            </Link>
            .
          </p>
        </div>

        {isLoading ? (
          <LoadingState />
        ) : isError ? (
          <ErrorState
            className="content-reveal"
            title="Não foi possível carregar os sistemas"
            description="Verifique sua conexão e tente novamente."
            onRetry={() => void refetch()}
          />
        ) : enabledPacks.length === 0 ? (
          <EmptyState
            className="content-reveal"
            icon={Library}
            title="Nenhum sistema disponível"
            description="Assim que um sistema de regras for publicado, ele aparece aqui."
          />
        ) : (
          <ul className="grid list-none gap-6 p-0 content-reveal xl:grid-cols-2">
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
