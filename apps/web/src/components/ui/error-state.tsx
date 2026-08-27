'use client';

import { AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ErrorStateProps {
  title: string;
  description?: string;
  onRetry?: () => void;
  /** Disables the retry button and spins its icon while a refetch is in flight. */
  isRetrying?: boolean;
  className?: string;
}

/** The one "it failed" surface, paired with `EmptyState`. */
export const ErrorState = ({
  title,
  description,
  onRetry,
  isRetrying,
  className,
}: ErrorStateProps) => (
  <div
    role="alert"
    className={cn(
      'flex flex-col items-center justify-center gap-4 rounded-xl border border-destructive/40 bg-destructive/5 px-6 py-12 text-center',
      className
    )}
  >
    <AlertCircle className="h-10 w-10 text-destructive" aria-hidden="true" />
    <div className="max-w-md space-y-1">
      <p className="font-medium text-foreground">{title}</p>
      {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
    </div>
    {onRetry ? (
      <Button type="button" variant="outline" onClick={onRetry} disabled={isRetrying}>
        <RefreshCw
          className={cn('mr-2 h-4 w-4', isRetrying && 'animate-spin')}
          aria-hidden="true"
        />
        Tentar novamente
      </Button>
    ) : null}
  </div>
);
