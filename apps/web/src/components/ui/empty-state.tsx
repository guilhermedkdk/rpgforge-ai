import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  /** Optional call to action (a Button, usually). */
  action?: ReactNode;
  className?: string;
}

/** The one "nothing here" surface: lists, grids and filtered results all render this. */
export const EmptyState = ({
  icon: Icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) => (
  <div
    className={cn(
      'flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card px-6 py-16 text-center',
      className
    )}
  >
    <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-icon-bg">
      <Icon className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
    </div>
    <h3 className="font-serif text-xl font-semibold text-foreground">{title}</h3>
    {description ? (
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">{description}</p>
    ) : null}
    {action ? <div className="mt-6">{action}</div> : null}
  </div>
);
