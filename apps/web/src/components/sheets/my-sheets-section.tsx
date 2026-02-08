'use client';

import { Scroll } from 'lucide-react';
import { EmptyState } from './empty-state';
import { SheetGridSkeleton } from './sheet-skeleton';

interface MySheetsSectionProps {
  isLoading: boolean;
}

export const MySheetsSection = ({ isLoading }: MySheetsSectionProps) => {
  return (
    <section aria-labelledby="my-sheets-title">
      {/* Section Header */}
      <div className="mb-6 flex items-center gap-3">
        <Scroll className="h-6 w-6 text-primary" aria-hidden="true" />
        <h2 id="my-sheets-title" className="font-serif text-2xl font-bold text-foreground">
          Minhas Fichas
        </h2>
      </div>

      {/* Content */}
      {isLoading ? <SheetGridSkeleton count={6} /> : <EmptyState />}
    </section>
  );
};
