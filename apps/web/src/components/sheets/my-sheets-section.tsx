'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { AlertCircle, ChevronRight, RefreshCw, Scroll } from 'lucide-react';
import { characterSheetsApi } from '@/lib/api/character-sheets';
import { packsApi } from '@/lib/api/packs';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { LoadingState } from '@/components/ui/loading-state';
import { EmptyState } from './empty-state';
import type { CharacterSheetSummary } from '@rpgforce-ai/shared';

function formatUpdatedAt(iso: string): string {
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function SheetListCard({
  sheet,
  packName,
}: {
  sheet: CharacterSheetSummary;
  packName: string | null;
}) {
  const href = `/sheets/${encodeURIComponent(sheet.id)}`;
  const title = sheet.name.trim() || 'Sem nome';

  return (
    <Link
      href={href}
      className="group block h-full outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-xl"
    >
      <Card className="h-full border-border bg-card py-0 transition-shadow group-hover:shadow-md group-focus-visible:shadow-md">
        <CardHeader className="gap-1 border-b border-border/60 px-4 pb-3 pt-4">
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="font-serif text-lg leading-tight text-foreground line-clamp-2">
              {title}
            </CardTitle>
            <Scroll
              className="h-5 w-5 shrink-0 text-muted-foreground opacity-70"
              aria-hidden="true"
            />
          </div>
          <p className="text-sm text-muted-foreground line-clamp-1">
            {packName ?? 'Sistema de regras'}
          </p>
        </CardHeader>
        <CardContent className="px-4 py-3">
          <p className="text-xs text-muted-foreground">
            Atualizado em {formatUpdatedAt(sheet.updatedAt)}
          </p>
        </CardContent>
        <CardFooter className="justify-end border-t border-border/60 px-4 py-3">
          <span className="inline-flex items-center text-sm font-medium text-primary group-hover:underline">
            Abrir ficha
            <ChevronRight className="ml-1 h-4 w-4" aria-hidden="true" />
          </span>
        </CardFooter>
      </Card>
    </Link>
  );
}

export const MySheetsSection = () => {
  const {
    data: sheets = [],
    isLoading: sheetsLoading,
    isError: sheetsError,
    error: sheetsErr,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ['character-sheets', 'list'],
    queryFn: () => characterSheetsApi.list(),
  });

  const { data: packs = [], isLoading: packsLoading } = useQuery({
    queryKey: ['packs'],
    queryFn: packsApi.getAll,
  });

  const packNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of packs) {
      m.set(p.id, p.name);
    }
    return m;
  }, [packs]);

  const isLoading = sheetsLoading || (sheets.length > 0 && packsLoading);

  const sheetsErrorMessage = (() => {
    if (!sheetsErr) return 'Erro ao carregar fichas.';
    if (isAxiosError(sheetsErr) && sheetsErr.response?.status === 401) {
      return 'Sua sessão expirou. Faça login novamente.';
    }
    if (
      isAxiosError(sheetsErr) &&
      sheetsErr.response?.data &&
      typeof sheetsErr.response.data === 'object'
    ) {
      const d = sheetsErr.response.data as { message?: string | string[] };
      if (typeof d.message === 'string') return d.message;
      if (Array.isArray(d.message)) return d.message.join(', ');
    }
    return 'Verifique se você está logado e tente de novo.';
  })();

  return (
    <>
      {sheetsError ? (
        <div
          className="flex flex-col items-center justify-center gap-4 rounded-lg border border-destructive/40 bg-destructive/5 px-6 py-12 text-center"
          role="alert"
        >
          <AlertCircle className="h-10 w-10 text-destructive" aria-hidden="true" />
          <div className="max-w-md space-y-1">
            <p className="font-medium text-foreground">Não foi possível carregar suas fichas.</p>
            <p className="text-sm text-muted-foreground">{sheetsErrorMessage}</p>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => void refetch()}
            disabled={isFetching}
          >
            <RefreshCw
              className={`mr-2 h-4 w-4 ${isFetching ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            Tentar novamente
          </Button>
        </div>
      ) : isLoading ? (
        <LoadingState />
      ) : sheets.length === 0 ? (
        <EmptyState />
      ) : (
        <ul className="grid list-none gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3">
          {sheets.map((sheet) => (
            <li key={sheet.id} className="min-w-0">
              <SheetListCard sheet={sheet} packName={packNameById.get(sheet.packId) ?? null} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
};
