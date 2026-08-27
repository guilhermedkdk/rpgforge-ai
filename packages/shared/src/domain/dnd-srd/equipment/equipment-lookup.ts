/**
 * Resolving equipment display names to catalog rule-item ids (name↔id), and resolving
 * tool-proficiency placeholder lines. All catalog data is passed in — no live catalog dependency.
 */
import {
  itemCategoryTag,
  stripToolItemPriceSuffix,
  TOOL_CATEGORY_TO_TAG,
} from '../proficiencies/tool-proficiencies';

/**
 * Starting-equipment lines that name a CATEGORY and still owe a concrete item pick.
 *
 * Single source for the three consumers that must agree on them: the save validation (which reports
 * the pending pick), the editor's pickers, and the AI generation (which has to make the pick itself,
 * or every draft carrying one arrives incomplete).
 */
export const HOLY_SYMBOL_PLACEHOLDER_LINE = 'holy symbol';
export const MUSICAL_INSTRUMENT_PLACEHOLDER_LINE = 'musical instrument of your choice';

/**
 * Whether a catalog item can satisfy the generic "Holy Symbol" line. Matched by name because the
 * pack tags every holy symbol as plain adventuring gear: the only marker is the "Holy Symbol, <kind>"
 * naming (Amulet / Emblem / Reliquary).
 */
export function isHolySymbolItemName(name: string): boolean {
  return normalizeEquipmentUnicodePunctuation(name).trim().toLowerCase().startsWith('holy symbol,');
}

/** Tag every musical instrument carries; the concrete pick for the instrument placeholder. */
export const MUSICAL_INSTRUMENT_CATEGORY_TAG = itemCategoryTag('musical-instrument');

/**
 * Splits a catalog item name into its display name, bundle quantity and base name:
 * "Arrows (20)" → { displayName: 'Arrows (20)', bundleQty: 20, baseName: 'Arrows' }.
 */
export function parseBundleItemName(rawName: string): {
  displayName: string;
  bundleQty: number | null;
  baseName: string;
} {
  const displayName = stripToolItemPriceSuffix(rawName);
  const bundleMatch = displayName.match(/\s*\(\s*(\d+)\s*\)\s*$/);
  const bundleQty = bundleMatch ? parseInt(bundleMatch[1], 10) : null;
  const baseName = displayName.replace(/\s*\(\s*\d+\s*\)\s*$/, '').trim();
  return { displayName, bundleQty, baseName };
}

/** Fold smart quotes / apostrophe-like chars so sheet text matches DB names consistently. */
function normalizeEquipmentUnicodePunctuation(name: string): string {
  return String(name)
    .replace(/[‘’‚‛′‵`´]/g, "'")
    .replace(/[“”„‟″‶]/g, '"');
}

/** Normalized key for matching sheet lines to catalog item names (handles punctuation variants). */
export function normalizeEquipmentLookupKey(name: string): string {
  return normalizeEquipmentUnicodePunctuation(name)
    .trim()
    .toLowerCase()
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9\s'-]/g, '')
    .trim();
}

/**
 * Alternate phrasings for the same item (e.g. "Traveler's Clothes" vs "Clothes, Traveler's").
 */
export function canonicalEquipmentLookupKeys(phrase: string): string[] {
  const keys = new Set<string>();
  const norm = normalizeEquipmentLookupKey(phrase);
  if (norm) {
    keys.add(norm);
    // Also register singular/plural so "Arrow" resolves to "Arrows (20)" and vice-versa.
    if (norm.length > 2 && norm.endsWith('s')) keys.add(norm.slice(0, -1));
    else if (norm.length > 1) keys.add(norm + 's');
  }
  const t = normalizeEquipmentUnicodePunctuation(String(phrase)).trim();
  if (!t) return [...keys];

  // "Name (Variant)" → also try "Name Variant" and "Name, Variant" so that
  // e.g. "Arcane Focus (crystal)" resolves to "Arcane Focus, Crystal".
  const parenMatch = t.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  if (parenMatch) {
    const base = parenMatch[1].trim();
    const variant = parenMatch[2].trim();
    keys.add(normalizeEquipmentLookupKey(`${base} ${variant}`));
    keys.add(normalizeEquipmentLookupKey(`${base}, ${variant}`));
    // "Quarterstaff" is a staff — also generate aliases for the staff variant names
    // so that e.g. "Arcane Focus (Quarterstaff)" resolves to "Arcane Focus, Staff"
    // and "Druidic Focus (Quarterstaff)" resolves to "Druidic Focus, Wooden Staff".
    if (variant.toLowerCase() === 'quarterstaff') {
      keys.add(normalizeEquipmentLookupKey(`${base} Staff`));
      keys.add(normalizeEquipmentLookupKey(`${base}, Staff`));
      keys.add(normalizeEquipmentLookupKey(`${base} Wooden Staff`));
      keys.add(normalizeEquipmentLookupKey(`${base}, Wooden Staff`));
    }
  }

  const commaIdx = t.indexOf(',');
  if (commaIdx > 0) {
    const left = t.slice(0, commaIdx).trim();
    const right = t.slice(commaIdx + 1).trim();
    keys.add(normalizeEquipmentLookupKey(`${right} ${left}`));
    keys.add(normalizeEquipmentLookupKey(`${right}, ${left}`));
  }

  const parts = t.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const last = parts[parts.length - 1]!;
    const rest = parts.slice(0, -1).join(' ');
    keys.add(normalizeEquipmentLookupKey(`${last}, ${rest}`));
  }
  return [...keys].filter(Boolean);
}

/** Maps normalized keys → rule item id (first wins). Register every alias for each catalog name. */
export function buildEquipmentItemIdLookupMap(
  items: { id: string; name: string }[]
): Map<string, string> {
  const m = new Map<string, string>();
  for (const it of items) {
    for (const k of canonicalEquipmentLookupKeys(it.name)) {
      if (k && !m.has(k)) m.set(k, it.id);
    }
  }
  return m;
}

/**
 * Items that appear in starting equipment text but don't exist by that name in the DB.
 * Maps normalized display name → canonical DB item name.
 */
const EQUIPMENT_NAME_ALIASES: Record<string, string> = {
  spellbook: 'book',
};

/** Resolves a line display name to a rule item id, or null if not in catalog. */
export function resolveEquipmentItemId(
  lineName: string,
  lookup: Map<string, string>
): string | null {
  for (const k of canonicalEquipmentLookupKeys(lineName)) {
    const id = lookup.get(k);
    if (id) return id;
  }
  const stripped = String(lineName).replace(/\s+of\s+your\s+choice\s*$/i, '').trim();
  if (stripped !== lineName) {
    for (const k of canonicalEquipmentLookupKeys(stripped)) {
      const id = lookup.get(k);
      if (id) return id;
    }
  }
  const alias = EQUIPMENT_NAME_ALIASES[normalizeEquipmentLookupKey(lineName)];
  if (alias) {
    for (const k of canonicalEquipmentLookupKeys(alias)) {
      const id = lookup.get(k);
      if (id) return id;
    }
  }
  return null;
}

/** Minimal extraction of item:category:* tags from a "Choose N X or Y" proficiency key. */
function parseToolChoiceCategoryTags(key: string): string[] | null {
  const m = key.match(/^Choose\s+(?:\d+|one)\s+(?:(?:kind|type)\s+of\s+)?(.+)$/i);
  if (!m) return null;
  return m[1]
    .split(/\s+or\s+/i)
    .map((p) => {
      const n = p.trim().toLowerCase().replace(/[‘’']/g, "'").replace(/\s+/g, ' ');
      const slug = TOOL_CATEGORY_TO_TAG[n] ?? n.replace(/\s+/g, '-').replace(/'/g, '');
      return itemCategoryTag(slug);
    });
}

/**
 * Resolves equipment placeholder lines that reference tool proficiency choices:
 *   "Artisan's Tools or Musical Instrument chosen for the tool proficiency above"
 *   "Gaming Set (same as above)"
 *
 * Returns the actual chosen item name from toolProficiencyChoices,
 * null if the placeholder matched but no choice was made (skip the line),
 * or the original line unchanged if it's not a recognised placeholder.
 */
export function resolveEquipmentToolPlaceholder(
  line: string,
  toolProficiencyChoices: Record<string, string[]>
): string | null | typeof line {
  const norm = line.trim().toLowerCase();

  let targetTags: string[] | null = null;

  if (
    (norm.includes('artisan') || norm.includes('musical instrument')) &&
    (norm.includes('proficiency') || norm.includes('chosen for'))
  ) {
    targetTags = [itemCategoryTag('artisan'), itemCategoryTag('musical-instrument')];
  } else if (norm.includes('gaming set') && norm.includes('same as above')) {
    targetTags = [itemCategoryTag('gaming-set')];
  }

  if (!targetTags) return line; // Not a placeholder — return unchanged.

  for (const [key, chosen] of Object.entries(toolProficiencyChoices)) {
    const parsed = parseToolChoiceCategoryTags(key);
    if (parsed && parsed.some((t) => targetTags!.includes(t))) {
      return chosen[0] ?? null;
    }
  }
  return null; // Placeholder matched but no choice made yet.
}
