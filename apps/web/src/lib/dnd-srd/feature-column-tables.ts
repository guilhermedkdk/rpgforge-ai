/**
 * Resolves and places the class-table column a feature references in its description
 * ("…the {Column} column of the {Class} Features table"). Resolution falls back to a
 * slug of the column's key, so it survives upstream name typos (Druid's "Cantrips
 * Known" column is keyed `…_wild-shape-uses`).
 */

export interface LevelValueRow {
  level: number;
  value: string;
}

export interface FeatureColumnTable {
  label: string;
  rows: LevelValueRow[];
}

// Capture is case-sensitive (column names are Title Case) so it can't start at an
// earlier "the " — e.g. Rage's "…the number of times…the Rages column…".
const COLUMN_REF_RE =
  /\bthe\s+([A-Z][A-Za-z0-9'’-]*(?:\s+[A-Z][A-Za-z0-9'’-]*)*)\s+column\s+of\s+the\s+[A-Za-z0-9'’ -]+?\s+Features\s+table\b/g;

const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function extractColumnReferences(desc: string): string[] {
  if (!desc) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const m of desc.matchAll(COLUMN_REF_RE)) {
    const name = m[1]?.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

export function descReferencesColumn(desc: string, label: string): boolean {
  if (!desc || !label) return false;
  return new RegExp(`\\bthe\\s+${escapeRegExp(label)}\\s+column\\s+of\\s+the\\b`, 'i').test(desc);
}

export function columnSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Slug from a column key, dropping the `{sourceKey}_` prefix and role suffix
 * (`srd-2024_druid_wild-shape-uses` → `wild-shape`). */
export function columnKeySlug(key: string, sourceKey: string): string {
  let s = key;
  if (sourceKey && s.startsWith(`${sourceKey}_`)) s = s.slice(sourceKey.length + 1);
  s = s.replace(/_/g, '-').replace(/-(column-data|uses|dice|count|data)$/i, '');
  return columnSlug(s);
}

export type DescSegment =
  | { type: 'prose'; text: string }
  | { type: 'table'; table: FeatureColumnTable };

/** Ordered prose/table segments: each table after the paragraph that references its
 * column; unreferenced tables appended at the end. */
export function splitDescByColumnTables(
  desc: string,
  tables: FeatureColumnTable[],
): DescSegment[] {
  const text = desc ?? '';
  const anchored: Array<{ table: FeatureColumnTable; at: number }> = [];
  const leftover: FeatureColumnTable[] = [];

  for (const table of tables) {
    const m = new RegExp(
      `\\bthe\\s+${escapeRegExp(table.label)}\\s+column\\s+of\\s+the\\b`,
      'i',
    ).exec(text);
    if (!m) {
      leftover.push(table);
      continue;
    }
    const paraEnd = text.indexOf('\n\n', m.index);
    anchored.push({ table, at: paraEnd === -1 ? text.length : paraEnd });
  }
  anchored.sort((a, b) => a.at - b.at);

  const segments: DescSegment[] = [];
  let cursor = 0;
  for (const { table, at } of anchored) {
    const prose = text.slice(cursor, at).trim();
    if (prose) segments.push({ type: 'prose', text: prose });
    segments.push({ type: 'table', table });
    cursor = at;
  }
  const tail = text.slice(cursor).trim();
  if (tail) segments.push({ type: 'prose', text: tail });
  for (const table of leftover) segments.push({ type: 'table', table });
  return segments;
}
