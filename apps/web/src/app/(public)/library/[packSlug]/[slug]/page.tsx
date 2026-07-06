'use client';

import { Suspense } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { Header } from '@/components/layout/header';
import { SiteFooter } from '@/components/layout/footer';
import { Button } from '@/components/ui/button';
import { LoadingState } from '@/components/ui/loading-state';
import { packsApi } from '@/lib/api/packs';
import { ruleItemsApi } from '@/lib/api/rule-items';
import { systemRegistry } from '@/components/systems/registry';

/** Only accept internal, same-pack listing paths — never an absolute or cross-pack URL. */
const isValidFromHref = (value: string | null, packSlug: string): value is string =>
  !!value && value.startsWith(`/library/${packSlug}`);

function LibraryItemPageContent() {
  const { packSlug, slug } = useParams<{ packSlug: string; slug: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();

  const { data: packs, isLoading: packsLoading } = useQuery({
    queryKey: ['packs'],
    queryFn: packsApi.getAll,
  });

  const pack = packs?.find((p) => p.slug === packSlug && p.isEnabled) ?? null;
  const entry = pack ? systemRegistry[pack.slug] : null;

  const {
    data: item,
    isLoading: itemLoading,
    error,
  } = useQuery({
    queryKey: ['rule-items', pack?.id, 'detail', slug],
    queryFn: () => ruleItemsApi.getByIdOrSlug(slug, pack?.id),
    enabled: !!pack && !!slug,
    retry: false,
    staleTime: Infinity,
  });

  const fromParam = searchParams.get('from');
  const backHref = isValidFromHref(fromParam, packSlug) ? fromParam : undefined;

  const notFound = isAxiosError(error) && error.response?.status === 404;
  const isLoading = packsLoading || itemLoading;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">
        {isLoading ? (
          <LoadingState />
        ) : error || !pack || !entry || !item ? (
          <div className="flex flex-col items-center gap-4 py-24 text-center">
            <p className="font-serif text-lg font-semibold text-foreground">
              {notFound ? 'Este item não existe na biblioteca' : 'Não foi possível carregar o item'}
            </p>
            <p className="max-w-md text-sm text-muted-foreground">
              {notFound
                ? 'Ele pode ter sido removido ou o endereço está incorreto.'
                : 'Verifique sua conexão e tente novamente.'}
            </p>
            <Button
              variant="outline"
              onClick={() =>
                router.push(pack ? `/library/${encodeURIComponent(pack.slug)}` : '/library')
              }
            >
              Voltar para a biblioteca
            </Button>
          </div>
        ) : (
          <entry.libraryItem pack={pack} item={item} backHref={backHref} />
        )}
      </main>
      <SiteFooter />
    </div>
  );
}

export default function LibraryItemPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen flex-col bg-background">
          <Header />
          <main className="mx-auto flex w-full max-w-4xl flex-1 items-center justify-center px-4 py-8">
            <LoadingState />
          </main>
        </div>
      }
    >
      <LibraryItemPageContent />
    </Suspense>
  );
}
