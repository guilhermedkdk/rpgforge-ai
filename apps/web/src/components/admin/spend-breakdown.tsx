'use client';

import type { AdminSpendSlice } from '@rpgforce-ai/shared';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { formatCompact, formatUsd } from './format';

/** Friendlier names for the ledger's operation keys, which are code identifiers. */
const OPERATION_LABELS: Record<string, string> = {
  'generation.questions': 'Perguntas do assistente',
  'generation.character': 'Geração de ficha',
  'search.embedding': 'Busca semântica',
  'embed.backfill': 'Indexação do catálogo',
};

interface SpendBreakdownProps {
  title: string;
  /** One line saying what the rows are, so the card explains itself. */
  description: string;
  slices: AdminSpendSlice[];
  /** Renders the ledger's keys as readable names; raw keys pass through untouched. */
  labelled?: boolean;
  emptyLabel: string;
}

/**
 * Spend per model or per step, as a bar list: label, bar, value on one row.
 *
 * A bar list rather than a pie: these values are compared, not read as parts of a whole, and with
 * two or three slices a pie would be the anti-pattern. It is already its own table view, since every
 * row carries its number as text. Each row's tooltip carries the LEDGER's raw key, which is what
 * ties a friendly label like "Perguntas do assistente" back to `generation.questions`.
 */
export const SpendBreakdown = ({
  title,
  description,
  slices,
  labelled = false,
  emptyLabel,
}: SpendBreakdownProps) => {
  const max = Math.max(...slices.map((s) => s.costMicroUsd), 0);

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
      <div className="flex flex-col gap-0.5">
        <h2 className="font-serif text-base font-semibold text-foreground">{title}</h2>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>

      {slices.length === 0 ? (
        <p className="text-xs text-muted-foreground">{emptyLabel}</p>
      ) : (
        <ul className="flex list-none flex-col gap-2.5 p-0">
          {slices.map((slice) => {
            const label = labelled ? (OPERATION_LABELS[slice.key] ?? slice.key) : slice.key;
            const percent = max > 0 ? Math.max((slice.costMicroUsd / max) * 100, 2) : 0;
            return (
              <li key={slice.key} className="flex flex-col gap-1">
                <div className="flex items-baseline justify-between gap-3">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="min-w-0 cursor-help truncate text-xs text-foreground">
                        {label}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="top" align="start">
                      <span className="font-mono">{slice.key}</span>
                    </TooltipContent>
                  </Tooltip>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {formatUsd(slice.costMicroUsd)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className="h-1.5 rounded-full"
                    style={{ width: `${percent}%`, backgroundColor: 'var(--chart-1)' }}
                    aria-hidden="true"
                  />
                  <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground/80">
                    {slice.calls} {slice.calls === 1 ? 'chamada' : 'chamadas'} ·{' '}
                    {formatCompact(slice.tokens)} tokens
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};
