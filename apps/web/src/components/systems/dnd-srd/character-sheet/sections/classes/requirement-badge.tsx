'use client';

import type { ReactNode } from 'react';
import { Check, TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/utils';

export type RequirementTone = 'met' | 'unmet' | 'neutral';

const toneClass: Record<RequirementTone, string> = {
  met: 'border-border bg-secondary/60 text-muted-foreground',
  unmet: 'border-destructive/45 bg-destructive/5 text-destructive',
  neutral: 'border-border bg-secondary/60 text-muted-foreground',
};

/**
 * The ONE pill every multiclass prerequisite is stated in, both for the classes already on the sheet
 * and for the cards offering a new one: stated in two different shapes, the same rule read as two.
 * A `<span>`, not a `<div>`: the class cards are buttons, which take phrasing content only.
 */
export const RequirementBadge = ({
  tone,
  children,
  className,
}: {
  tone: RequirementTone;
  children: ReactNode;
  className?: string;
}) => {
  const Icon = tone === 'met' ? Check : tone === 'unmet' ? TriangleAlert : null;
  return (
    <span
      className={cn(
        'inline-flex w-fit items-center gap-1.5 rounded-full border px-2 py-0.5 text-2xs leading-snug',
        toneClass[tone],
        className
      )}
    >
      {Icon && <Icon className="h-3 w-3 shrink-0" aria-hidden />}
      <span className="min-w-0">{children}</span>
    </span>
  );
};
