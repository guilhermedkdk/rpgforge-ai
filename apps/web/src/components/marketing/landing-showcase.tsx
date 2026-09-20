'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { Button } from '@/components/ui/button';
import { PublicSheetCard } from '@/components/sheets/public-sheet-card';
import { publicSheetsApi } from '@/lib/api/public-sheets';
import { packsApi } from '@/lib/api/packs';

/** One row on a wide screen: a sample that points at /explore, not a second explore page. */
const SHOWCASE_COUNT = 3;

/**
 * The published-sheets band on the landing page.
 *
 * An island because it is the only part of that page that needs data: the pitch around it is static
 * and ships in the server-rendered HTML, so a slow feed delays this section alone.
 */
export const LandingShowcase = () => {
  const { user, isLoading } = useAuth();

  // Showing published sheets here is the same open feed /explore reads, so it costs nothing extra
  // and it is real content instead of a mockup.
  const { data: packs } = useQuery({ queryKey: ['packs'], queryFn: packsApi.getAll });
  const { data: showcase } = useQuery({
    queryKey: ['public-sheets', 'landing'],
    queryFn: () => publicSheetsApi.list({ limit: SHOWCASE_COUNT, offset: 0 }),
    enabled: !isLoading && !user,
  });

  const packById = new Map((packs ?? []).map((pack) => [pack.id, pack]));
  const sheets = showcase?.items ?? [];

  if (sheets.length === 0) {
    return null;
  }

  return (
    <section className="mx-auto w-full max-w-5xl px-4 py-16">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-serif text-2xl font-bold text-foreground md:text-3xl">
            Fichas publicadas agora
          </h2>
          {/* Claims only what the feed can back: these are real published sheets. It does not
              promise a community, which two cards from one account would visibly contradict. */}
          <p className="mt-1 text-sm text-muted-foreground">
            Fichas de verdade, publicadas por quem já forjou aqui.
          </p>
        </div>
        <Button variant="ghost" asChild>
          <Link href="/explore">
            Ver todas
            <ArrowRight className="ml-1 h-4 w-4" aria-hidden="true" />
          </Link>
        </Button>
      </div>

      {/* Columns follow the count: a fixed 3-track grid holding 2 results leaves a third of the row
          blank, which reads as a failed load rather than as a short feed. */}
      <div
        className={`grid gap-4 ${
          sheets.length === 1
            ? 'max-w-md'
            : sheets.length === 2
              ? 'sm:grid-cols-2'
              : 'sm:grid-cols-2 lg:grid-cols-3'
        }`}
      >
        {sheets.map((sheet) => {
          const pack = packById.get(sheet.packId);
          return (
            <PublicSheetCard
              key={sheet.id}
              sheet={sheet}
              packName={pack?.name ?? null}
              packSlug={pack?.slug ?? null}
            />
          );
        })}
      </div>
    </section>
  );
};
