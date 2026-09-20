'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { Bookmark, Compass, Scroll } from 'lucide-react';
import type { CharacterSheetSummary, PublicSheetSummary } from '@rpgforce-ai/shared';
import { Header } from '@/components/layout/header';
import { SiteFooter } from '@/components/layout/footer';
import { ProfileHeader } from '@/components/profile/profile-header';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { LoadingState } from '@/components/ui/loading-state';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PublicSheetCard } from '@/components/sheets/public-sheet-card';
import { OwnedSheetCard } from '@/components/sheets/owned-sheet-card';
import { usersApi } from '@/lib/api/users';
import { publicSheetPath } from '@/lib/public-sheet-path';
import { packsApi } from '@/lib/api/packs';

export default function ProfilePage() {
  const { username } = useParams<{ username: string }>();

  const {
    data: profile,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['profile', username],
    queryFn: () => usersApi.getProfile(username),
    enabled: !!username,
    retry: false,
  });

  // The sheet card shows the system's name and its art, both of which come from the pack.
  const { data: packs } = useQuery({
    queryKey: ['packs'],
    queryFn: packsApi.getAll,
    enabled: (profile?.sheets.length ?? 0) > 0 || (profile?.favorites.length ?? 0) > 0,
  });
  const packById = new Map((packs ?? []).map((pack) => [pack.id, pack]));
  const packOf = (sheet: { packId: string }) => ({
    packName: packById.get(sheet.packId)?.name ?? null,
    packSlug: packById.get(sheet.packId)?.slug ?? null,
  });

  const notFound = isAxiosError(error) && error.response?.status === 404;

  const ownSheets = (sheets: CharacterSheetSummary[], isSelf: boolean, handle: string) =>
    sheets.length === 0 ? (
      <EmptyState
        icon={Scroll}
        title={isSelf ? 'Você ainda não tem fichas' : 'Nenhuma ficha pública'}
        description={
          isSelf
            ? 'Crie a primeira e ela aparece aqui.'
            : 'Esta pessoa ainda não publicou nenhuma ficha.'
        }
        action={
          isSelf ? (
            <Button asChild>
              <Link href="/create">Criar Ficha</Link>
            </Button>
          ) : undefined
        }
      />
    ) : (
      <Grid>
        {sheets.map((sheet) => (
          <li key={sheet.id} className="min-w-0">
            <OwnedSheetCard
              sheet={sheet}
              {...packOf(sheet)}
              showVisibility={isSelf}
              href={isSelf ? undefined : publicSheetPath(handle, sheet.id)}
            />
          </li>
        ))}
      </Grid>
    );

  const favorites = (sheets: PublicSheetSummary[]) =>
    sheets.length === 0 ? (
      <EmptyState
        icon={Bookmark}
        title="Nenhuma ficha salva ainda"
        description="Salve fichas de outras pessoas na página Explorar e elas ficam guardadas aqui."
        action={
          <Button asChild variant="outline">
            <Link href="/explore">
              <Compass className="mr-1.5 h-4 w-4" aria-hidden="true" />
              Explorar fichas
            </Link>
          </Button>
        }
      />
    ) : (
      <Grid>
        {sheets.map((sheet) => (
          <li key={sheet.id} className="min-w-0">
            <PublicSheetCard sheet={sheet} {...packOf(sheet)} />
          </li>
        ))}
      </Grid>
    );

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        {isLoading ? (
          <LoadingState />
        ) : notFound ? (
          <ErrorState
            title="Perfil não encontrado"
            description="Esse nome de usuário não existe ou foi alterado."
          />
        ) : error || !profile ? (
          <ErrorState
            title="Não foi possível carregar o perfil"
            description="Verifique sua conexão e tente novamente."
          />
        ) : (
          <div className="flex flex-col gap-6 content-reveal">
            <ProfileHeader profile={profile} />

            {profile.isSelf ? (
              // Tabs only for the owner, who has two lists. They also keep the bookmarks visible as
              // a FEATURE when there are none: the old layout dropped the whole section, so nobody
              // who had not used it could learn it existed.
              <Tabs defaultValue="fichas" className="flex flex-col gap-4">
                <TabsList className="w-fit">
                  <TabsTrigger value="fichas" className="gap-1.5">
                    <Scroll className="h-3.5 w-3.5" aria-hidden="true" />
                    Fichas
                    <span className="text-muted-foreground">({profile.sheets.length})</span>
                  </TabsTrigger>
                  <TabsTrigger value="favoritas" className="gap-1.5">
                    <Bookmark className="h-3.5 w-3.5" aria-hidden="true" />
                    Favoritas
                    <span className="text-muted-foreground">({profile.favorites.length})</span>
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="fichas">
                  {ownSheets(profile.sheets, true, profile.username)}
                </TabsContent>
                <TabsContent value="favoritas">{favorites(profile.favorites)}</TabsContent>
              </Tabs>
            ) : (
              <section className="flex flex-col gap-4">
                <div className="flex items-center gap-2">
                  <Scroll className="h-4 w-4 text-primary-ink" aria-hidden="true" />
                  <h2 className="font-serif text-lg font-semibold text-foreground">
                    Fichas públicas
                  </h2>
                  <span className="text-sm text-muted-foreground">({profile.sheetCount})</span>
                </div>
                {ownSheets(profile.sheets, false, profile.username)}
              </section>
            )}
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}

const Grid = ({ children }: { children: ReactNode }) => (
  <ul className="grid list-none gap-4 p-0 sm:grid-cols-2">{children}</ul>
);
