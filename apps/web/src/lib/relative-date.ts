const UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ['year', 365 * 24 * 60 * 60 * 1000],
  ['month', 30 * 24 * 60 * 60 * 1000],
  ['week', 7 * 24 * 60 * 60 * 1000],
  ['day', 24 * 60 * 60 * 1000],
  ['hour', 60 * 60 * 1000],
  ['minute', 60 * 1000],
];

/**
 * "há 3 dias" for a past ISO date, "agora" under a minute.
 *
 * Relative to the render, so it belongs to client components only: on the server it would be frozen
 * into the HTML and then disagree with the browser.
 */
export const formatRelativeDate = (iso: string): string => {
  const elapsed = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(elapsed)) return '';

  const formatter = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' });
  for (const [unit, ms] of UNITS) {
    if (Math.abs(elapsed) >= ms) return formatter.format(-Math.round(elapsed / ms), unit);
  }
  return 'agora';
};

/** The same date spelled out, for the `title` of whatever shows the relative one. */
export const formatExactDate = (iso: string): string => {
  try {
    return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long' }).format(new Date(iso));
  } catch {
    return iso;
  }
};
