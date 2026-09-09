'use client';

import * as React from 'react';
import { getFeatMeta, type RuleItemResponse } from '@rpgforce-ai/shared';
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
        className
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
const FEATURE_DETAIL_OPTION_BODY_STACK =
  'mt-0.5 flex flex-col gap-1.5 border-t border-border/60 pt-1.5';

/** Slightly tighter stack (Fighting Style markdown fallback). */
export const FEATURE_DETAIL_OPTION_BODY_STACK_COMPACT =
  'mt-1 flex flex-col gap-1 border-t border-border/60 pt-1.5';

/**
 * Standard body of a feat row (name + prerequisite + benefits). When the feat has no structured
 * `benefits[]`, falls back to the raw desc so the row is never left with just the name.
 * The single body used by ALL feat selectors (ASI, Epic Boon, Versatile, Fighting Style,
 * Additional Fighting Style, Eldritch Invocations); do not reimplement inline.
 */
export function FeatOptionRowBody({ feat }: { feat: RuleItemResponse }) {
  const { benefitDescs, prerequisite } = getFeatMeta(feat);
  const descFallback = String(
    ((feat.normalized ?? {}) as Record<string, unknown>).desc ??
      ((feat.raw ?? {}) as Record<string, unknown>).desc ??
      feat.contentMd ??
      ''
  );
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-foreground">{feat.name}</span>
      {prerequisite ? (
        <span className="text-xs text-muted-foreground">
          <span className="font-medium">Prerequisite:</span> {prerequisite}
        </span>
      ) : null}
      {benefitDescs.length > 0 ? (
        <div className={FEATURE_DETAIL_OPTION_BODY_STACK}>
          {benefitDescs.map((desc, idx) => (
            <span key={idx} className="whitespace-pre-line text-xs text-muted-foreground">
              {desc}
            </span>
          ))}
        </div>
      ) : descFallback ? (
        <span
          className={cn(
            FEATURE_DETAIL_OPTION_BODY_RULE_SINGLE,
            'whitespace-pre-line text-xs text-muted-foreground'
          )}
        >
          {descFallback}
        </span>
      ) : null}
    </div>
  );
}

/** Feature-modal option rows — use these for any new “pick one/many from a list” UI. */
export {
  FeatureOptionRow,
  featureSelectionCheckboxClass,
  featureSelectionRowClass,
} from './feature-option-row';
