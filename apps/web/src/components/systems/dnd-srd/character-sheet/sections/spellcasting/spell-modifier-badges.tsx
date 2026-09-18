'use client';

import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { SpellModifier } from '@rpgforce-ai/shared';

/**
 * Spell-row markers for features that modify a spell. The badge carries the EFFECT with the
 * character's resolved numbers ("+4 dmg", "+360ft"), never an abbreviated feature name, so the row
 * says what changed at a glance; hovering any badge opens the full breakdown. Modifiers come from
 * shared `computeSpellModifiers`.
 */

const ENHANCED_BY_LABEL = 'Enhanced by';

// Deliberately lowercase and unpadded: three stacked badges (Eldritch Blast with Agonizing Blast +
// Eldritch Spear + Repelling Blast) is the widest real case, and uppercase truncated the spell name.
const badgeClass =
  'inline-flex items-center rounded border border-primary/40 bg-primary/10 px-0.5 text-3xs font-semibold whitespace-nowrap text-primary-ink';

const headingClass = 'text-3xs font-semibold uppercase tracking-widest text-muted-foreground';

// Full-name + effect breakdown, shared by the row tooltip and the detail popover section below.
function SpellModifierList({
  modifiers,
  className,
}: {
  modifiers: SpellModifier[];
  className?: string;
}) {
  return (
    <ul className={cn('space-y-1.5', className)}>
      {modifiers.map((m, i) => (
        <li key={`${m.featureName}-${i}`} className="flex gap-1.5">
          <span className="mt-[0.4rem] h-1 w-1 shrink-0 rounded-full bg-primary" aria-hidden />
          <span className="min-w-0">
            <span className="block">
              <span className="font-semibold text-foreground">{m.featureName}</span>
              <span className="text-muted-foreground"> · {m.sourceLabel}</span>
              {m.cost && <span className="text-muted-foreground"> · costs {m.cost}</span>}
            </span>
            <span className="block text-muted-foreground">{m.detail}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** The "Enhanced by" block as rendered inside the spell detail popover. */
export function SpellModifierSection({ modifiers }: { modifiers: SpellModifier[] }) {
  if (modifiers.length === 0) return null;
  return (
    <div className="space-y-1.5 border-t border-border/40 pt-2 text-xs">
      <div className={headingClass}>{ENHANCED_BY_LABEL}</div>
      <SpellModifierList modifiers={modifiers} />
    </div>
  );
}

/**
 * When the effect badges stop fitting the row they collapse into one counted marker: a Sorcerer's
 * Metamagic alone can qualify 7+ modifiers on one spell.
 *
 * The fit test weighs the spell NAME too, because a character count gets it wrong: "Charm Monster"
 * renders wider than "Eldritch Blast" despite being shorter. The weights approximate glyph advance
 * at this font and the budget is tuned to the pixel, so re-measure before moving it.
 */
const MAX_INLINE_BADGES = 3;
const INLINE_FIT_BUDGET = 31.5;
const BADGE_CHROME_WIDTH = 1.6;

const estimateWidth = (text: string): number =>
  [...text].reduce((w, c) => w + (/[MWmw]/.test(c) ? 1.6 : /[iljtfI.,'’ ]/.test(c) ? 0.5 : 1), 0);

/** The row badges: one per effect, ordered by the shared derivation (damage first). */
export function SpellModifierBadges({
  modifiers,
  spellName,
}: {
  modifiers: SpellModifier[];
  /** Weighed into the fit test: the name must never be the thing that gets truncated. */
  spellName: string;
}) {
  if (modifiers.length === 0) return null;
  const badgesWidth = modifiers.reduce(
    (sum, m) => sum + estimateWidth(m.badge ?? '••') + BADGE_CHROME_WIDTH,
    0
  );
  const collapsed =
    modifiers.length > MAX_INLINE_BADGES ||
    estimateWidth(spellName) + badgesWidth > INLINE_FIT_BUDGET;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={cn('flex shrink-0 items-center gap-0.5', collapsed && 'mr-1')}>
          {collapsed ? (
            <span className={cn(badgeClass, 'relative px-1 py-0.5')}>
              <Sparkles className="h-3 w-3" aria-hidden />
              <span className="absolute -right-1.5 -top-1.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-primary px-0.5 text-[9px] font-bold leading-none text-primary-foreground">
                {modifiers.length}
              </span>
            </span>
          ) : (
            modifiers.map((m, i) => (
              <span key={`${m.featureName}-${i}`} className={badgeClass}>
                {m.badge ?? <Sparkles className="h-2.5 w-2.5" aria-hidden />}
              </span>
            ))
          )}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-70 space-y-1.5 text-xs">
        <div className={headingClass}>
          {ENHANCED_BY_LABEL}
          {collapsed && ` · ${modifiers.length}`}
        </div>
        <SpellModifierList modifiers={modifiers} />
      </TooltipContent>
    </Tooltip>
  );
}
