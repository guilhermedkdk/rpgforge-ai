import type { ElementType, ReactNode } from 'react';
import { RPGForgeMark } from '@/components/brand/rpgforge-mark';
import { cn } from '@/lib/utils';

interface AuthCardProps {
  title: string;
  description: string;
  /** Takes over the description row while a submit fails, so the card never grows. */
  error?: string | null;
  /**
   * Element the heading and subtitle render as.
   *
   * The dialog passes Radix's `DialogTitle`/`DialogDescription` so the modal is labelled by the very
   * heading it already shows, instead of carrying a second hidden one.
   */
  titleAs?: ElementType;
  descriptionAs?: ElementType;
  children: ReactNode;
}

/** Shell for the header-less auth pages: carries the brand mark those pages would otherwise lack. */
export const AuthCard = ({
  title,
  description,
  error,
  titleAs: Title = 'h1',
  descriptionAs: Description = 'p',
  children,
}: AuthCardProps) => (
  <div className="rounded-xl border border-border bg-card p-6">
    <div className="mb-6 flex flex-col items-center gap-3 text-center">
      <RPGForgeMark className="h-11 w-11 text-primary-ink" />
      <div>
        <Title className="font-serif text-3xl font-bold text-foreground">{title}</Title>
        <Description
          className={cn(
            'mt-1 text-sm',
            error ? 'font-medium text-destructive' : 'text-muted-foreground'
          )}
          role={error ? 'alert' : undefined}
          aria-live="assertive"
        >
          {error || description}
        </Description>
      </div>
    </div>
    {children}
  </div>
);
