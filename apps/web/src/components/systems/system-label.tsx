import { cn } from '@/lib/utils';

/**
 * The rule system a sheet belongs to, as a small caps label. Text only: the feed mixes systems, so
 * the name has to be the first thing read, and nothing else in the band should compete with it.
 */
export const SystemLabel = ({ name, className }: { name: string | null; className?: string }) => (
  <span
    className={cn(
      'truncate text-xs font-bold uppercase tracking-[0.16em] text-primary-ink',
      className
    )}
  >
    {name ?? 'Sistema de regras'}
  </span>
);
