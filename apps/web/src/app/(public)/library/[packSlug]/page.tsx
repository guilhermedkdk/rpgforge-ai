'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Header } from '@/components/layout/header';
import { SiteFooter } from '@/components/layout/footer';
import { Button } from '@/components/ui/button';
import { LoadingState } from '@/components/ui/loading-state';
import { packsApi } from '@/lib/api/packs';
import { systemRegistry } from '@/components/systems/registry';

export default function PackLibraryPage() {
  const { packSlug } = useParams<{ packSlug: string }>();
  const router = useRouter();

  const {
    data: packs,
    isLoading,
    isError,
    refetch,
  } = useQuery({ queryKey: ['packs'], queryFn: packsApi.getAll });

  const pack = packs?.find((p) => p.slug === packSlug && p.isEnabled) ?? null;
  const entry = pack ? systemRegistry[pack.slug] : null;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8">
        {isLoading ? (
          <LoadingState />
        ) : isError ? (
          <div className="flex flex-col items-center gap-4 py-24 text-center">
            <p className="font-serif text-lg font-semibold text-foreground">
              Não foi possível carregar a biblioteca
            </p>
            <p className="max-w-md text-sm text-muted-foreground">
              Verifique sua conexão e tente novamente.
            </p>
            <Button variant="outline" onClick={() => void refetch()}>
              Tentar novamente
            </Button>
          </div>
        ) : pack && entry ? (
          <entry.library pack={pack} />
        ) : (
          <div className="flex flex-col items-center gap-4 py-24 text-center">
            <p className="font-serif text-lg font-semibold text-foreground">
              {pack
                ? `O sistema ${pack.name} ainda não possui uma biblioteca disponível.`
                : 'Este sistema não existe na biblioteca'}
            </p>
            <Button variant="outline" onClick={() => router.push('/library')}>
              Ver todos os sistemas
            </Button>
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
