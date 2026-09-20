'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import type { AiDecision, AiDecisionArea, AiSpellNote } from '@rpgforce-ai/shared';

/**
 * Game-style hints for AI-generated sheets: every area the AI decided something about gets a "!"
 * marker, and opening it reveals the justification. A marker never dismisses itself: on the
 * wizard's review they all stay up, and on a saved sheet the header's eye is the only switch.
 *
 * Markers float on the card's top-right. The provider is a no-op when the sheet carries no AI
 * decisions, so manual creation is untouched.
 */

interface AiHintsValue {
  byArea: Partial<Record<AiDecisionArea, string[]>>;
  bySpell: Map<string, string>;
}

const EMPTY: AiHintsValue = { byArea: {}, bySpell: new Map() };

const AiHintsContext = createContext<AiHintsValue>(EMPTY);

export const AiHintsProvider = ({
  decisions,
  spellNotes,
  enabled = true,
  children,
}: {
  decisions?: AiDecision[] | null;
  spellNotes?: AiSpellNote[] | null;
  /** False hides every marker; the saved sheet's eye drives it. */
  enabled?: boolean;
  children: ReactNode;
}) => {
  const value = useMemo<AiHintsValue>(() => {
    if (!enabled) return EMPTY;
    const byArea: Partial<Record<AiDecisionArea, string[]>> = {};
    for (const d of decisions ?? []) {
      const points = d.points.map((p) => p.trim()).filter(Boolean);
      if (points.length) byArea[d.area] = points;
    }
    const bySpell = new Map<string, string>();
    for (const n of spellNotes ?? []) {
      const reason = n.reason.trim();
      if (reason) bySpell.set(n.spell.trim().toLowerCase(), reason);
    }
    return { byArea, bySpell };
  }, [decisions, spellNotes, enabled]);
  return <AiHintsContext.Provider value={value}>{children}</AiHintsContext.Provider>;
};

/** The "!" badge + its tooltip; content varies per caller. */
function HintMarker({ content, className }: { content: ReactNode; className?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label="Ver decisão da IA"
          className={cn(
            // The circle (a separate layer below) is what grows on hover; the "!" stays put so it
            // never jitters off-center. `group` drives the inner layer's hover scale.
            'group relative flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded-full text-2xs font-black leading-none text-primary-foreground transition-transform duration-300 animate-in zoom-in focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            className
          )}
        >
          <span
            aria-hidden
            className="absolute inset-0 rounded-full border-2 border-background bg-primary shadow-md shadow-primary/40 transition-transform duration-300 group-hover:scale-110"
          />
          <span className="relative">!</span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-xs text-left leading-relaxed">
        {content}
      </TooltipContent>
    </Tooltip>
  );
}

export const AiHint = ({ area, className }: { area: AiDecisionArea; className?: string }) => {
  const points = useContext(AiHintsContext).byArea[area];
  if (!points || points.length === 0) return null;
  return (
    <HintMarker
      className={className}
      content={
        points.length === 1 ? (
          <span>{points[0]}</span>
        ) : (
          <ul className="list-disc space-y-1 pl-4">
            {points.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        )
      }
    />
  );
};

/** Per-spell hint anchored to a spell row (renders only when the AI left a note for that spell). */
export const AiSpellHint = ({ spell, className }: { spell: string; className?: string }) => {
  const reason = useContext(AiHintsContext).bySpell.get(spell.trim().toLowerCase());
  if (!reason) return null;
  return (
    <HintMarker className={cn('h-4 w-4 text-[9px]', className)} content={<span>{reason}</span>} />
  );
};
