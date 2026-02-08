'use client';

import { Header } from '@/components/layout/header';
import { MySheetsSection } from '@/components/sheets/my-sheets-section';

export default function SheetsPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />

      <main className="mx-auto flex-1 w-full max-w-7xl px-4 py-8">
        <div className="flex flex-col gap-8 lg:flex-row lg:gap-8">
          {/* Main Content - My Sheets */}
          <div className="flex-1 min-w-0">
            <MySheetsSection isLoading={false} />
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="mt-auto border-t border-border bg-card/50 py-8">
        <div className="mx-auto max-w-7xl px-4 text-center">
          <p className="text-sm text-muted-foreground">
            RPGForge AI — Forje seus personagens, viva suas histórias.
          </p>
        </div>
      </footer>
    </div>
  );
}
