'use client';

import { Scroll } from 'lucide-react';
import { useRequireAuth } from '@/contexts/auth-context';
import { Header } from '@/components/layout/header';
import { SiteFooter } from '@/components/layout/footer';
import { LoadingState } from '@/components/ui/loading-state';
import { MySheetsSection } from '@/components/sheets/my-sheets-section';

export default function SheetsPage() {
  const { ready } = useRequireAuth();

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8">
        <div className="mb-6 flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <Scroll className="h-6 w-6 text-primary" aria-hidden="true" />
            <h1 className="font-serif text-2xl font-bold text-foreground">Minhas Fichas</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Acompanhe os personagens que você já criou e continue de onde parou.
          </p>
        </div>
        {ready ? <MySheetsSection /> : <LoadingState />}
      </main>
      <SiteFooter />
    </div>
  );
}
