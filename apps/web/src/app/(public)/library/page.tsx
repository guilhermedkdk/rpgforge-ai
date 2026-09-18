'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import type { LucideIcon } from 'lucide-react';
import { BookOpen, ChevronRight, Clock, Library, Scale } from 'lucide-react';
import { Header } from '@/components/layout/header';
import { SiteFooter } from '@/components/layout/footer';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { LoadingState } from '@/components/ui/loading-state';
import { packsApi } from '@/lib/api/packs';
import { licenseLabel } from '@/lib/license';
import { systemRegistry } from '@/components/systems/registry';
import { PackIcon } from '@/components/systems/pack-icon';
import type { PackResponse } from '@rpgforce-ai/shared';

const Chip = ({ icon: Icon, label }: { icon: LucideIcon; label: string }) => (
  <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background/60 px-2.5 py-1 text-xs text-muted-foreground">
    <Icon className="h-3 w-3 text-primary-ink" aria-hidden="true" />
    {label}
  </span>
);

const SystemCardBody = ({ pack, hasLibrary }: { pack: PackResponse; hasLibrary: boolean }) => {
  const meta = [pack.systemName, `versão ${pack.version}`, pack.publisherName]
    .filter(Boolean)
    .join(' · ');

  return (
    <>
      {hasLibrary && (
        <div
          className="pointer-events-none absolute inset-0 bg-linear-to-br from-primary/10 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100"
          aria-hidden="true"
        />
      )}

      <div className="relative flex items-start gap-4">
        <div
          className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-secondary text-muted-foreground transition-colors duration-300 ${
            hasLibrary ? 'group-hover:bg-primary group-hover:text-primary-foreground' : ''
          }`}
        >
          <PackIcon slug={pack.slug} className="h-7 w-7" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-serif text-xl font-bold text-foreground">{pack.name}</h2>
          <p className="mt-0.5 truncate text-sm text-muted-foreground">{meta}</p>
        </div>
        {hasLibrary && (
          <ChevronRight
            className="mt-1 h-5 w-5 shrink-0 text-muted-foreground/40 transition-colors duration-300 group-hover:text-primary-ink"
            aria-hidden="true"
          />
        )}
      </div>

      {pack.description ? (
        <p className="relative mt-4 line-clamp-3 text-sm leading-relaxed text-muted-foreground">
          {pack.description}
        </p>
      ) : null}

      <div className="relative mt-auto flex flex-wrap gap-2 pt-5">
        <Chip icon={Scale} label={licenseLabel(pack.licenseType)} />
        {hasLibrary ? (
          <Chip icon={BookOpen} label="Catálogo completo" />
        ) : (
          <Chip icon={Clock} label="Em breve" />
        )}
      </div>
    </>
  );
};

const SystemCard = ({ pack }: { pack: PackResponse }) => {
  const hasLibrary = Boolean(systemRegistry[pack.slug]);
  const shell =
    'group relative flex h-full max-w-md flex-col overflow-hidden rounded-xl border bg-card p-6';

  // A pack with no library UI has nowhere to navigate to, so it stays a plain (unclickable) card.
  if (!hasLibrary) {
    return (
      <div className={`${shell} cursor-not-allowed border-border opacity-60`}>
        <SystemCardBody pack={pack} hasLibrary={false} />
      </div>
    );
  }

  return (
    <Link
      href={`/library/${encodeURIComponent(pack.slug)}`}
      aria-label={`Explorar as regras de ${pack.name}`}
      className={`${shell} border-border transition-[border-color,box-shadow] duration-300 hover:border-primary/40 hover:shadow-md hover:shadow-primary/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`}
    >
      <SystemCardBody pack={pack} hasLibrary />
    </Link>
  );
};

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
          <ul className="grid list-none gap-6 p-0 md:grid-cols-2 content-reveal">
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
