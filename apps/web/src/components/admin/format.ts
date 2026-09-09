const MICRO_PER_USD = 1_000_000;

/**
 * Micro-dollars as money.
 *
 * A single wizard call costs ~2000 micro (US$ 0.002), so two decimals would round the whole panel to
 * zero: below a cent the amount is shown to four places, and only above it does it read as money.
 */
export const formatUsd = (microUsd: number): string => {
  const usd = microUsd / MICRO_PER_USD;
  if (usd === 0) return 'US$ 0';
  // Below four decimals the rounded figure prints as "US$ 0.0000", which reads as nothing spent.
  if (usd < 0.0001) return '< US$ 0.0001';
  if (usd < 0.01) return `US$ ${usd.toFixed(4)}`;
  if (usd < 1000) return `US$ ${usd.toFixed(2)}`;
  return `US$ ${usd.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`;
};

/** Big token counts read as 1,3 mi rather than 1301249. */
export const formatCompact = (value: number): string => {
  if (value < 1000) return String(value);
  if (value < 1_000_000) return `${(value / 1000).toFixed(value < 10_000 ? 1 : 0)} mil`;
  return `${(value / 1_000_000).toFixed(1)} mi`;
};

export const formatNumber = (value: number): string => value.toLocaleString('pt-BR');

/** Day key (YYYY-MM-DD) as a short axis label. Parsed as local, never as an instant. */
export const formatDayShort = (dayKey: string): string => {
  const [year, month, day] = dayKey.split('-').map(Number);
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' }).format(
    new Date(year, (month ?? 1) - 1, day ?? 1)
  );
};

export const formatDayLong = (dayKey: string): string => {
  const [year, month, day] = dayKey.split('-').map(Number);
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'long' }).format(
    new Date(year, (month ?? 1) - 1, day ?? 1)
  );
};

export const formatDateTime = (iso: string | null): string => {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(
    new Date(iso)
  );
};
