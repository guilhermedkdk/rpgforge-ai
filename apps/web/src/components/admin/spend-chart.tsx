'use client';

import { useState } from 'react';
import { Table2, BarChart3 } from 'lucide-react';
import type { AdminSpendDay } from '@rpgforce-ai/shared';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { formatDayLong, formatDayShort, formatNumber, formatUsd } from './format';

/** Plot height without the axis band, which is added below it so the card never scrolls. */
const PLOT_HEIGHT = 140;
/** A bar this short would be invisible; a day with any spend at all must read as a bar. */
const MIN_BAR_PERCENT = 3;

interface SpendChartProps {
  days: AdminSpendDay[];
  /** Held at reduced opacity during a refetch instead of collapsing to a spinner. */
  isRefetching?: boolean;
}

/**
 * Daily AI spend: one series, so one color for every bar and no legend (the title names it).
 *
 * Bars rather than a line because the days are discrete buckets and most of them are zero: a line
 * through zeros reads as a measured flatline, while an absent bar reads as the quiet day it was.
 * Every value is reachable without hovering, through the table view.
 */
export const SpendChart = ({ days, isRefetching = false }: SpendChartProps) => {
  const [asTable, setAsTable] = useState(false);
  const [hovered, setHovered] = useState<number | null>(null);

  const max = Math.max(...days.map((d) => d.costMicroUsd), 0);
  const total = days.reduce((sum, d) => sum + d.costMicroUsd, 0);

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 className="font-serif text-base font-semibold text-foreground">
            Gasto de IA por dia
          </h2>
          <p className="text-xs text-muted-foreground">
            {formatUsd(total)} no período · pico de {formatUsd(max)}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setAsTable((v) => !v)}
          aria-pressed={asTable}
        >
          {asTable ? (
            <BarChart3 className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <Table2 className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
          )}
          {asTable ? 'Ver gráfico' : 'Ver tabela'}
        </Button>
      </header>

      <div className={cn('transition-opacity', isRefetching && 'opacity-60')}>
        {/* The table's pr-2: the scroll container's bar would otherwise sit against the
            right-aligned last column, which reads as a clipped value. */}
        {asTable ? (
          <div className="max-h-64 overflow-y-auto pr-2">
            <table className="w-full table-fixed text-sm">
              <caption className="sr-only">Gasto de IA por dia</caption>
              {/* Fixed widths: otherwise each column sizes to its own header and the numbers sit at
                  four different distances from their titles. */}
              <colgroup>
                <col className="w-[34%]" />
                <col className="w-[22%]" />
                <col className="w-[22%]" />
                <col className="w-[22%]" />
              </colgroup>
              <thead className="sticky top-0 bg-card">
                <tr className="border-b border-border text-center text-xs uppercase tracking-wide text-muted-foreground">
                  <th scope="col" className="py-1.5 pr-2 text-left font-medium">
                    Dia
                  </th>
                  <th scope="col" className="py-1.5 pr-2 text-center font-medium">
                    Chamadas
                  </th>
                  <th scope="col" className="py-1.5 pr-2 text-center font-medium">
                    Tokens
                  </th>
                  <th scope="col" className="py-1.5 text-center font-medium">
                    Gasto
                  </th>
                </tr>
              </thead>
              <tbody>
                {days.map((day) => (
                  <tr key={day.day} className="border-b border-border/50 last:border-0">
                    <td className="py-1.5 pr-2 text-muted-foreground">{formatDayLong(day.day)}</td>
                    <td className="py-1.5 pr-2 text-center tabular-nums">{day.calls}</td>
                    <td className="py-1.5 pr-2 text-center tabular-nums">
                      {formatNumber(day.tokens)}
                    </td>
                    <td className="py-1.5 text-center tabular-nums">
                      {formatUsd(day.costMicroUsd)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex flex-col">
            {/* Plot. The row is `items-end` so every bar grows from a shared baseline. */}
            <div
              className="relative flex items-end gap-0.5"
              style={{ height: PLOT_HEIGHT }}
              onMouseLeave={() => setHovered(null)}
            >
              {/* One hairline baseline, solid and one shade off the surface. */}
              <span
                className="pointer-events-none absolute inset-x-0 bottom-0 border-t border-border"
                aria-hidden="true"
              />
              {days.map((day, index) => {
                const percent =
                  max > 0 && day.costMicroUsd > 0
                    ? Math.max((day.costMicroUsd / max) * 100, MIN_BAR_PERCENT)
                    : 0;
                const isActive = hovered === index;
                return (
                  // Hover AND keyboard focus open the same tooltip, which is the only place the
                  // per-account split of a day appears.
                  <Tooltip key={day.day}>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        // The hit area is the whole column, not the bar: a 6px-wide target would be
                        // unhittable on a quiet day.
                        className="group relative flex h-full flex-1 items-end focus:outline-none"
                        onMouseEnter={() => setHovered(index)}
                        onFocus={() => setHovered(index)}
                        onBlur={() => setHovered(null)}
                        aria-label={`${formatDayLong(day.day)}: ${formatUsd(day.costMicroUsd)}, ${day.calls} chamadas`}
                      >
                        <span
                          className={cn(
                            'w-full rounded-t transition-all',
                            percent === 0 && 'bg-border/60',
                            isActive ? 'opacity-100' : 'opacity-85 group-hover:opacity-100'
                          )}
                          style={{
                            height: percent === 0 ? 2 : `${percent}%`,
                            backgroundColor: percent === 0 ? undefined : 'var(--chart-1)',
                          }}
                        />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-64">
                      <p className="font-medium text-foreground">{formatDayLong(day.day)}</p>
                      {day.users.length === 0 ? (
                        <p className="text-muted-foreground">Nenhuma chamada.</p>
                      ) : (
                        <ul className="mt-1 flex list-none flex-col gap-0.5 p-0">
                          {day.users.map((entry, position) => (
                            <li
                              key={entry.username ?? String(position)}
                              className="flex items-baseline justify-between gap-3"
                            >
                              <span className="min-w-0 truncate">
                                {entry.displayName?.trim() ||
                                  (entry.username ? '@' + entry.username : 'conta removida')}
                              </span>
                              <span className="shrink-0 tabular-nums text-muted-foreground">
                                {formatUsd(entry.costMicroUsd)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </div>

            {/* Axis band, inside the same container as the plot: a fixed height that excluded it
                would give the card its own tiny scrollbar. First and last day only, plus the
                hovered one, so the labels can never collide. */}
            <div className="mt-1.5 flex gap-0.5 text-[10px] tabular-nums text-muted-foreground">
              {days.map((day, index) => (
                <span key={day.day} className="flex-1 text-center">
                  {index === 0 || index === days.length - 1 || index === hovered
                    ? formatDayShort(day.day)
                    : ''}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
};
