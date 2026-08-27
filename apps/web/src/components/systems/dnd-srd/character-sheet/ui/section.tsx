import * as React from 'react';
import { cn } from '@/lib/utils';
import type { AiDecisionArea } from '@rpgforce-ai/shared';
import { AiHint } from './ai-hint';

export interface SectionProps {
  title: React.ReactNode;
  icon?: React.ReactNode;
  headerAction?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  /** Sheet area for the AI-decision hint icon (renders only when the AI draft has one). */
  aiHintArea?: AiDecisionArea;
}

export function Section({
  title,
  icon,
  headerAction,
  children,
  className = '',
  aiHintArea,
}: SectionProps) {
  return (
    <div className={cn('relative rounded-lg border border-border bg-card p-4', className)}>
      {aiHintArea && (
        <AiHint area={aiHintArea} className="absolute -right-2 -top-2 z-10 h-6 w-6 text-[13px]" />
      )}
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
