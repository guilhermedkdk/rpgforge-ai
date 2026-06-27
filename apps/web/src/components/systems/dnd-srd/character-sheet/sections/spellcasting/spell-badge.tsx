'use client';

import * as React from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

/**
 * A badge on a spell row marking that a feature modifies the spell (e.g. a Warlock Eldritch
 * Invocation, or Cleric Blessed Strikes → Potent Spellcasting).
 *
 * Standard for every spell badge:
 * - `label`: an uppercase tag naming the source feature, not the effect (e.g. "Invocation" for
 *   Eldritch Invocations, "Blessed" for Blessed Strikes).
 * - `tooltip`: always phrased `Modified by: <specific modifier(s)>` so the wording is consistent
 *   across badges (the invocation names, "Potent Spellcasting", …).
 *
 * Build badges via `buildSpellModifierBadge` so the tooltip wording stays unified.
 */
export interface SpellBadge {
  label: string;
  tooltip: string;
}

/** Single place that fixes the `Modified by: …` tooltip wording shared by all spell badges. */
export function buildSpellModifierBadge(label: string, sources: string[]): SpellBadge {
  return { label, tooltip: `Modified by: ${sources.join(', ')}` };
}

const SPELL_BADGE_CLASS =
  'rounded border border-primary/40 bg-primary/10 px-1 text-[10px] font-semibold uppercase tracking-wider text-primary';

/** Renders a spell row's modifier badges with the shared style + tooltip. */
export function SpellBadges({ badges }: { badges: SpellBadge[] }) {
  if (badges.length === 0) return null;
  return (
    <>
      {badges.map((badge, i) => (
        <Tooltip key={`${badge.label}-${i}`}>
          <TooltipTrigger asChild>
            <span className={SPELL_BADGE_CLASS}>{badge.label}</span>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-[260px] text-xs">
            {badge.tooltip}
          </TooltipContent>
        </Tooltip>
      ))}
    </>
  );
}
