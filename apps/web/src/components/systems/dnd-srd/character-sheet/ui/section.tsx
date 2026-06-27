import * as React from 'react';
import { cn } from '@/lib/utils';

export interface SectionProps {
  title: React.ReactNode;
  icon?: React.ReactNode;
  headerAction?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export function Section({
  title,
  icon,
  headerAction,
  children,
  className = '',
}: SectionProps) {
  return (
    <div className={cn('rounded-lg border border-border bg-card p-4', className)}>
      <div className="mb-3 flex shrink-0 items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {icon && <span className="text-primary">{icon}</span>}
          {typeof title === 'string' ? (
            <h3 className="font-serif text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              {title}
            </h3>
          ) : (
            title
          )}
        </div>
        {headerAction}
      </div>
      {children}
    </div>
  );
}
