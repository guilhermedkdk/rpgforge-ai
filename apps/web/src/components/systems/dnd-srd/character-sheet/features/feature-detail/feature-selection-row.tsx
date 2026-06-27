'use client';

/**
 * Canonical UI for **choosing options inside the feature detail modal** (left square
 * checkbox + check or “E”, same metrics as the class-skills dropdown in
 * `abilities/saves-skills-column.tsx`).
 *
 * For new work:
 * - **Simple list** (single or multi pick, optional locked rows): prefer
 *   `SkillChoiceFromListBlock` in `skill-choice-from-list-block.tsx` — it wraps this row.
 * - **Custom body** (feat-style stack, markdown, trailing column): render
 *   `FeatureOptionRow` directly; use `alignTop` when the body is multi-line.
 * - **Data-driven options only** (no new panel): features that hit `GenericOptionsView`
 *   already use this pattern for segmented blocks and markdown `p` / `tr` pickers.
 *
 * Re-exported from `feature-detail-primitives.tsx` for a single import surface.
 */

import * as React from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Row + checkbox styling aligned with the class-skills picker (dropdown list items). */
export function featureSelectionRowClass(disabled: boolean, opts?: { alignTop?: boolean }) {
  return cn(
    'flex w-full gap-2 rounded-md border border-border/60 bg-muted/20 px-2 py-1.5 text-left text-foreground transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
    opts?.alignTop ? 'items-start' : 'items-center',
    disabled
      ? 'cursor-not-allowed opacity-60'
      : 'cursor-pointer hover:border-primary/50 hover:bg-muted/40',
  );
}

/** Left checkbox — same classes as the skills dropdown. */
export function featureSelectionCheckboxClass(selected: boolean) {
  return cn(
    'flex h-4 w-4 shrink-0 items-center justify-center rounded border border-input bg-background text-[10px] leading-none',
    selected ? 'border-primary bg-primary text-primary-foreground' : 'text-muted-foreground/50',
  );
}

export type FeatureOptionRowMark = 'check' | 'e';

export interface FeatureOptionRowProps {
  selected: boolean;
  disabled?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
  /** Default: Lucide check when selected. Use `e` for expertise-style marker. */
  mark?: FeatureOptionRowMark;
  className?: string;
  /** Multiline body (e.g. markdown block) — aligns checkbox to top. */
  alignTop?: boolean;
  /** Right column (optional metadata). */
  trailing?: React.ReactNode;
}

export function FeatureOptionRow({
  selected,
  disabled = false,
  onClick,
  children,
  mark = 'check',
  className,
  alignTop = false,
  trailing,
}: FeatureOptionRowProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(featureSelectionRowClass(disabled, { alignTop }), className)}
      aria-pressed={selected}
    >
      <span className={featureSelectionCheckboxClass(selected)} aria-hidden>
        {selected && mark === 'e' ? (
          'E'
        ) : selected ? (
          <Check className="h-3 w-3" strokeWidth={2.5} />
        ) : null}
      </span>
      <div
        className={cn(
          'min-w-0 flex-1 text-left',
          alignTop
            ? '[&_p:first-child]:mt-0'
            : 'flex items-center leading-4 text-xs font-medium text-foreground',
        )}
      >
        {children}
      </div>
      {trailing != null ? <div className="shrink-0">{trailing}</div> : null}
    </button>
  );
}
