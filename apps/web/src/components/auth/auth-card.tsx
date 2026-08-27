import type { ReactNode } from 'react';
import { Flame } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AuthCardProps {
  title: string;
  description: string;
  /** Takes over the description row while a submit fails, so the card never grows. */
  error?: string | null;
  children: ReactNode;
}

/** Shell for the header-less auth pages: carries the brand mark those pages would otherwise lack. */
export const AuthCard = ({ title, description, error, children }: AuthCardProps) => (
  <div className="rounded-xl border border-border bg-card p-6">
    <div className="mb-6 flex flex-col items-center gap-3 text-center">
      <Flame className="h-8 w-8 text-primary" aria-hidden="true" />
      <div>
        <h1 className="font-serif text-3xl font-bold text-foreground">{title}</h1>
        <p
          className={cn(
            'mt-1 text-sm',
            error ? 'font-medium text-destructive' : 'text-muted-foreground'
          )}
          role={error ? 'alert' : undefined}
          aria-live="assertive"
        >
          {error || description}
        </p>
      </div>
    </div>
    {children}
  </div>
);
