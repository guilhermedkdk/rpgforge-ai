'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { Header } from '@/components/layout/header';
import { SiteFooter } from '@/components/layout/footer';
import { BackLink } from '@/components/ui/back-link';
import { LoadingState } from '@/components/ui/loading-state';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Lock, ScrollText, UserRound } from 'lucide-react';
import { FavoriteButton } from '@/components/sheets/favorite-button';
import { publicSheetsApi } from '@/lib/api/public-sheets';
import { systemRegistry } from '@/components/systems/registry';

export default function PublicSheetPage() {
  const { username, id } = useParams<{ username: string; id: string }>();

  const { data, isLoading, error } = useQuery({
    queryKey: ['public-sheet', id],
    queryFn: () => publicSheetsApi.getByIdWithRules(id),
    enabled: !!id,
    retry: false,
  });

  const entry = data ? systemRegistry[data.pack.slug] : null;
  const owner = data?.owner;
  const ownerLabel = owner?.displayName?.trim() || owner?.username || username;
  // A private sheet answers 404 like a missing one, on purpose: whether it exists is not public.
  const notFound = isAxiosError(error) && error.response?.status === 404;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        {error ? (
          <div className="content-reveal">
            {notFound ? (
              <EmptyState
                icon={Lock}
                title="Esta ficha não está pública"
                description="Ela pode ter sido despublicada pelo autor ou nunca ter existido."
              />
            ) : (
              <ErrorState
                title="Não foi possível carregar a ficha"
                description="Verifique sua conexão e tente novamente."
              />
            )}
          </div>
        ) : isLoading || !data ? (
          <LoadingState />
        ) : !entry ? (
          <div className="content-reveal">
            <EmptyState
              icon={ScrollText}
              title={`O sistema ${data.pack.name} ainda não tem ficha visual`}
              description="Esta ficha existe, mas ainda não há como exibi-la aqui."
            />
          </div>
        ) : (
          <>
            {/* Inside the loaded branch on purpose: it appears WITH the sheet, not floating over a
                spinner. Explore, not the author's profile, because this URL is made to be shared and
                most arrivals never saw that profile. */}
            <BackLink href="/explore" className="mb-3">
              Explorar fichas
            </BackLink>
            <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
              <div className="flex min-w-0 flex-col gap-2">
                <h1 className="font-serif text-2xl font-bold text-foreground">
                  {data.sheet.name.trim() || 'Ficha sem nome'}
                </h1>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-sm text-muted-foreground">
                  {/* A pill rather than an underlined word: reaching the author is a real
                      destination here, and a link buried in a byline reads as decoration. */}
                  <Link
                    href={`/u/${encodeURIComponent(data.owner.username)}`}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-card/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <UserRound className="h-3.5 w-3.5 text-primary-ink" aria-hidden="true" />
                    {ownerLabel}
                  </Link>
                  <span>
                    Sistema: <span className="font-medium text-foreground">{data.pack.name}</span>
                  </span>
                </div>
              </div>
              <FavoriteButton
                sheetId={data.sheet.id}
                isFavorited={data.isFavorited}
                favoriteCount={data.favoriteCount}
              />
            </div>
            {entry.renderPublicSheet({ data })}
          </>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
