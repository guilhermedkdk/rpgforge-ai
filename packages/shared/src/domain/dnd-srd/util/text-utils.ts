// Generic string helpers shared across the D&D SRD domain (no domain data of their own).

/** Escapes a string for literal use inside a `RegExp`. */
export const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Trimmed + lowercased name for case-insensitive feature/item matching. */
export const normalizeName = (name: string | null | undefined): string =>
  (name ?? '').trim().toLowerCase();
