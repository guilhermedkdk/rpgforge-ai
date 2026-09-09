'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * The app's filter pill. One shape everywhere something is filtered or sorted (the library's
 * facets, the admin panel's period and sort rows).
 *
 * It is a CONTROL, so it reads as one: a pointer cursor, a border that answers on hover, and a focus
 * ring. That is what separates it from `SheetChip`, which is a read-out and must stay quiet.
 */
export const FilterChip = ({
  active,
  onClick,
  children,
  className,
  title,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  className?: string;
  title?: string;
}) => (
  <button
    type="button"
    aria-pressed={active}
    title={title}
    onClick={onClick}
    className={cn(FILTER_CHIP_CLASS, active ? FILTER_CHIP_ACTIVE : FILTER_CHIP_IDLE, className)}
  >
    {children}
  </button>
);

export const FILTER_CHIP_CLASS =
  'cursor-pointer rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

export const FILTER_CHIP_IDLE =
  'border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground';

export const FILTER_CHIP_ACTIVE = 'border-primary bg-primary text-primary-foreground';
