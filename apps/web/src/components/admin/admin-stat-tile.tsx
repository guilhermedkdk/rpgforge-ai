import type { LucideIcon } from 'lucide-react';

interface AdminStatTileProps {
  icon: LucideIcon;
  label: string;
  /** The headline figure, already formatted. */
  value: string;
  /** What changed inside the selected window, e.g. "+2 no período". Omitted when it says nothing. */
  delta?: string;
  /** One muted line under the figure, for the caveat a number needs. */
  note?: string;
}

/**
 * One number, which is the whole chart: a single value never earns a plot.
 *
 * The figure is sans and uses proportional figures on purpose: the page's serif is for headings, and
 * equal-width digits make a lone number look loose at display size. `tabular-nums` belongs in the
 * table, where digits line up in a column.
 */
export const AdminStatTile = ({ icon: Icon, label, value, delta, note }: AdminStatTileProps) => (
  <div className="flex flex-col gap-1 rounded-lg border border-border bg-card p-4">
    <span className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
      <Icon className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
      {label}
    </span>
    <span className="text-2xl font-semibold leading-tight text-foreground proportional-nums">
      {value}
    </span>
    {delta ? <span className="text-xs text-muted-foreground">{delta}</span> : null}
    {note ? <span className="text-xs text-muted-foreground/80">{note}</span> : null}
  </div>
);
