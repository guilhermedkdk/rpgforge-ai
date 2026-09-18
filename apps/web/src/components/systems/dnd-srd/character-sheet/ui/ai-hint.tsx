'use client';

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import type { AiDecision, AiDecisionArea, AiSpellNote } from '@rpgforce-ai/shared';

/**
 * Game-style hints for AI-generated drafts: every area the AI decided something about gets a "!"
 * marker, and opening it reveals the justification. Once it has been open long enough to count as
 * read, closing it dismisses that marker for good, so the sheet cleans itself up as it is reviewed.
 *
 * Markers float on the card's top-right. The provider is a no-op when the sheet carries no AI
 * decisions, so manual creation and saved-sheet editing are untouched.
 */

const MIN_READ_MS = 1200;

interface AiHintsValue {
  byArea: Partial<Record<AiDecisionArea, string[]>>;
  bySpell: Map<string, string>;
}

const AiHintsContext = createContext<AiHintsValue>({ byArea: {}, bySpell: new Map() });

export const AiHintsProvider = ({
  decisions,
  spellNotes,
  children,
}: {
  decisions?: AiDecision[] | null;
  spellNotes?: AiSpellNote[] | null;
  children: ReactNode;
}) => {
  const value = useMemo<AiHintsValue>(() => {
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
  }, [decisions, spellNotes]);
  return <AiHintsContext.Provider value={value}>{children}</AiHintsContext.Provider>;
};

/** The "!" badge + tooltip with the self-dismiss-after-read behavior; content varies per caller. */
function HintMarker({ content, className }: { content: ReactNode; className?: string }) {
  const [leaving, setLeaving] = useState(false);
  const [gone, setGone] = useState(false);
  const openedAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (!leaving) return;
    const t = setTimeout(() => setGone(true), 350);
    return () => clearTimeout(t);
  }, [leaving]);

  if (gone) return null;

  const handleOpenChange = (open: boolean) => {
    if (open) {
      openedAtRef.current = Date.now();
      return;
    }
    if (openedAtRef.current != null && Date.now() - openedAtRef.current >= MIN_READ_MS) {
      setLeaving(true);
    }
  };

  return (
    <Tooltip onOpenChange={handleOpenChange}>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label="Ver decisão da IA"
          className={cn(
            // The circle (a separate layer below) is what grows on hover; the "!" stays put so it
            // never jitters off-center. `group` drives the inner layer's hover scale.
            'group relative flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded-full text-2xs font-black leading-none text-primary-foreground transition-transform duration-300 animate-in zoom-in focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            leaving && 'pointer-events-none scale-0 opacity-0',
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
