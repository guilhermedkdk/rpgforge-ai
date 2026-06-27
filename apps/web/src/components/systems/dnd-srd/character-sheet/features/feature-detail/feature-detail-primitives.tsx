'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/** Top rule only (e.g. after intro text when parent already provides vertical gap). */
export const SELECTION_INLINE_TOP_RULE = 'border-t border-border/60 pt-3';

const selectionSectionDensity = {
  default: 'mt-4 border-t border-border/60 pt-3',
  compact: 'mt-3 border-t border-border/60 pt-3',
  tight: 'mt-3 border-t border-border/60 pt-2',
} as const;

export function SelectionSection({
  children,
  className,
  density = 'default',
}: {
  children: React.ReactNode;
  className?: string;
  density?: keyof typeof selectionSectionDensity;
}) {
  return <div className={cn(selectionSectionDensity[density], className)}>{children}</div>;
}

export function RequirementAlert({
  reasons,
  title = 'Requirements not met',
  fallbackText,
  className,
  listClassName,
  /** Rich list / body below title (e.g. list items with inline markup). */
  detail,
}: {
  reasons?: string[];
  title?: string;
  fallbackText?: string;
  className?: string;
  listClassName?: string;
  detail?: React.ReactNode;
}) {
  const list = reasons ?? [];
  return (
    <div
      className={cn(
        'rounded-md border border-destructive/40 bg-destructive/10 px-2 py-2 text-xs text-destructive',
        className,
      )}
      role="status"
    >
      <p className="font-semibold text-destructive">{title}</p>
      {detail != null ? (
        detail
      ) : list.length > 0 ? (
        <ul className={cn('mt-1 list-disc pl-4 text-destructive/90', listClassName)}>
          {list.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      ) : fallbackText ? (
        <p className="mt-2 text-destructive/90">{fallbackText}</p>
      ) : null}
    </div>
  );
}

/** Divider + single block of description under title/prerequisite (Metamagic, Eldritch). */
export const FEATURE_DETAIL_OPTION_BODY_RULE_SINGLE = 'mt-0.5 border-t border-border/60 pt-1.5';

/** Divider + stacked benefit lines (feats, versatile, ASI feat list). */
export const FEATURE_DETAIL_OPTION_BODY_STACK =
  'mt-0.5 flex flex-col gap-1.5 border-t border-border/60 pt-1.5';

/** Slightly tighter stack (Fighting Style markdown fallback). */
export const FEATURE_DETAIL_OPTION_BODY_STACK_COMPACT =
  'mt-1 flex flex-col gap-1 border-t border-border/60 pt-1.5';

/** Feature-modal option rows — use these for any new “pick one/many from a list” UI. */
export {
  FeatureOptionRow,
  featureSelectionCheckboxClass,
  featureSelectionRowClass,
} from './feature-selection-row';
export type { FeatureOptionRowMark, FeatureOptionRowProps } from './feature-selection-row';
