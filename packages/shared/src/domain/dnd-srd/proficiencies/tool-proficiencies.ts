/**
 * Tool-proficiency "Choose N ..." parsing + proficiency-label dedupe + the persisted→slots
 * redistribution, shared by the web editor and the backend save-time validation (the backend runs the
 * SAME seeding so a "Choose N tools" slot the user filled isn't seen as empty on save).
 */
import type { RuleItemResponse } from '../../../types/ruleitem';
import type { CharacterFormData } from '../character/character-form-data';
import { getEffectiveProficiencies } from '../derivation/derived-character-stats';

export const TOOL_CATEGORY_TO_TAG: Record<string, string> = {
  'musical instruments': 'musical-instrument',
  'musical instrument': 'musical-instrument',
  'gaming set': 'gaming-set',
  'gaming sets': 'gaming-set',
  "artisan's tools": 'artisan',
  'artisans tools': 'artisan',
  'artisan tools': 'artisan',
};

/** Builds the `item:category:<slug>` tag that classifies an equipment/tool item. */
export const itemCategoryTag = (slug: string): string => `item:category:${slug}`;

/** Tool-category slugs whose items make up the "Choose N tools" catalog. */
export const TOOL_CATEGORY_SLUGS = [
  'gaming-set',
  'musical-instrument',
  'artisan',
  'tools',
] as const;

/** Full `item:category:*` tag keys for every tool category (DB-query filter for the tool catalog). */
export const TOOL_CATEGORY_TAGS: string[] = TOOL_CATEGORY_SLUGS.map(itemCategoryTag);

export type ParsedToolChoose = {
  chooseN: number;
  categoryTags: string[];
  categoryLabel: string;
};

function phraseToToolCategorySlug(phrase: string): string | null {
  const normalized = phrase.trim().toLowerCase().replace(/[‘’']/g, "'").replace(/\s+/g, ' ').trim();
  if (!normalized) return null;
  if (TOOL_CATEGORY_TO_TAG[normalized]) return TOOL_CATEGORY_TO_TAG[normalized];
  return normalized.replace(/\s+/g, '-').replace(/'/g, '') || null;
}

export function parseToolProficiencyChoose(valueStr: string): ParsedToolChoose | null {
  const m = valueStr.match(/^Choose\s+(\d+|one)\s+(?:(?:kind|type)\s+of\s+)?(.+)$/i);
  if (!m) return null;
  const numRaw = m[1].toLowerCase();
  const chooseN = numRaw === 'one' ? 1 : Math.max(0, parseInt(numRaw, 10));
  const rest = m[2].trim();
  const categoryTags: string[] = [];
  for (const part of rest
    .split(/\s+or\s+/i)
    .map((p) => p.trim())
    .filter(Boolean)) {
    const slug = phraseToToolCategorySlug(part);
    if (!slug) continue;
    const tag = itemCategoryTag(slug);
    if (!categoryTags.includes(tag)) categoryTags.push(tag);
  }
  if (categoryTags.length === 0) return null;
  return { chooseN, categoryTags, categoryLabel: rest };
}

/** One unfilled "Choose N ..." tool slot. */
export type PendingToolProficiencyChoice = {
  /** The raw proficiency segment, also the `toolProficiencyChoices` key. */
  segment: string;
  categoryLabel: string;
  chooseN: number;
  chosen: number;
};

/**
 * Enumerates the "Choose N ..." tool slots that still need picks. Single source for the save-time
 * validation message and the play-mode lock (a committed slot renders read-only, a pending one stays
 * editable).
 */
export function getPendingToolProficiencyChoices(
  data: CharacterFormData
): PendingToolProficiencyChoice[] {
  const pending: PendingToolProficiencyChoice[] = [];
  // Reads the EFFECTIVE string (same as the section renders), so a slot added by a chosen option
  // can't be pending on screen yet counted as committed by the lock.
  const lines = getEffectiveProficiencies(data)
    .split(/\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  for (const line of lines) {
    const colonIdx = line.indexOf(':');
    const label = colonIdx !== -1 ? line.slice(0, colonIdx).trim() : line;
    const valueStr = colonIdx !== -1 ? line.slice(colonIdx + 1).trim() : '';
    if (!/tool/i.test(label) || !valueStr) continue;
    const segments = dedupeProficiencyLabelsPreserveOrder(
      valueStr
        .split(/\s*,\s*/)
        .map((s) => s.trim())
        .filter(Boolean)
    );
    for (const segment of segments) {
      const parsed = parseToolProficiencyChoose(segment);
      if (!parsed || parsed.chooseN <= 0) continue;
      const chosen = data.toolProficiencyChoices?.[segment]?.length ?? 0;
      if (chosen >= parsed.chooseN) continue;
      pending.push({
        segment,
        categoryLabel: parsed.categoryLabel,
        chooseN: parsed.chooseN,
        chosen,
      });
    }
  }
  return pending;
}

export function dedupeProficiencyLabelsPreserveOrder(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const k = item.trim().toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  return out;
}

/** Removes trailing Open5e-style price from item names, e.g. "Supplies (50 GP)" → "Supplies". */
export function stripToolItemPriceSuffix(name: string): string {
  return name.replace(/\s*\(\s*\d+(?:[.,]\d+)?\s*gp\s*\)\s*$/i, '').trim();
}

/** Stable key for comparing tool names across segments / API duplicates. */
export function toolDisplayKey(name: string): string {
  return stripToolItemPriceSuffix(name).trim().toLowerCase();
}

/**
 * Stable `tool:<slug>` choice key for a tool proficiency picked via the Skilled feat
 * (e.g. "Musical Instrument, Shawm" → "tool:musical-instrument-shawm").
 */
export function skilledToolChoiceKey(label: string): string {
  const slug = stripToolItemPriceSuffix(label)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `tool:${slug}`;
}

/** Maps each Skilled-feat `tool:<slug>` choice key back to its human label via the tool catalog. */
export function buildSkilledToolKeyToLabel(
  toolItemsByCategory: Record<string, RuleItemResponse[]>
): Map<string, string> {
  const map = new Map<string, string>();
  for (const item of Object.values(toolItemsByCategory).flat()) {
    const lbl = stripToolItemPriceSuffix(item.name).trim();
    if (!lbl) continue;
    const k = skilledToolChoiceKey(lbl);
    if (!map.has(k)) map.set(k, lbl);
  }
  return map;
}

/** Concatenated value of every proficiency line whose label matches `labelRe`. */
export function readProficiencyLineValue(data: CharacterFormData, labelRe: RegExp): string {
  let value = '';
  for (const rawLine of getEffectiveProficiencies(data).split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    const colonIdx = line.indexOf(':');
    const label = colonIdx !== -1 ? line.slice(0, colonIdx).trim() : line;
    if (!labelRe.test(label)) continue;
    const segment = colonIdx !== -1 ? line.slice(colonIdx + 1).trim() : '';
    if (segment) value = value ? `${value}, ${segment}` : segment;
  }
  return value;
}

/**
 * On load, redistributes the flat `persistedToolProficiencies` snapshot into the derived "Choose…"
 * slots (`toolProficiencyChoices`), matching each tool to a slot by category. Tools already covered
 * by fixed grants or the Skilled feat are skipped (those re-derive). Returns the patch to apply, or
 * null when there's nothing to do — including while the derivation / tool catalog is still loading.
 */
export function seedToolProficiencyChoicesFromPersisted(
  data: CharacterFormData,
  toolItemsByCategory: Record<string, RuleItemResponse[]>
): Pick<CharacterFormData, 'toolProficiencyChoices' | 'persistedToolProficiencies'> | null {
  const persisted = data.persistedToolProficiencies;
  if (!persisted || persisted.length === 0) return null;
  // Wait for the derivation to populate the proficiencies string before mapping (and clearing).
  if (!data.proficiencies?.trim()) return null;

  const toolValue = readProficiencyLineValue(data, /tool/i);
  const toolSegments = dedupeProficiencyLabelsPreserveOrder(
    toolValue
      .split(/\s*,\s*/)
      .map((s) => s.trim())
      .filter(Boolean)
  );
  const chooseSegments = toolSegments
    .map((seg) => ({ seg, parsed: parseToolProficiencyChoose(seg) }))
    .filter((x): x is { seg: string; parsed: ParsedToolChoose } => x.parsed != null);

  // No slots to map into: the persisted tools are all fixed/Skilled grants (re-derived). Clear.
  if (chooseSegments.length === 0) {
    return {
      toolProficiencyChoices: data.toolProficiencyChoices ?? {},
      persistedToolProficiencies: undefined,
    };
  }

  // Slots exist but the tool catalog hasn't loaded — wait so categories can be matched correctly.
  const allToolItems = Object.values(toolItemsByCategory).flat();
  if (allToolItems.length === 0) return null;

  // Skip persisted tools already granted as fixed proficiencies or by the Skilled feat.
  const skip = new Set<string>();
  for (const seg of toolSegments) {
    if (!parseToolProficiencyChoose(seg)) skip.add(toolDisplayKey(stripToolItemPriceSuffix(seg)));
  }
  const skilledKeyToLabel = buildSkilledToolKeyToLabel(toolItemsByCategory);
  for (const c of data.skilledProficiencyChoices ?? []) {
    if (!c.startsWith('tool:')) continue;
    skip.add(toolDisplayKey(skilledKeyToLabel.get(c) ?? c.slice('tool:'.length)));
  }

  const categoryByItemId = new Map<string, string>();
  const categoryByDisplayKey = new Map<string, string>();
  for (const [tag, items] of Object.entries(toolItemsByCategory)) {
    for (const item of items) {
      if (!categoryByItemId.has(item.id)) categoryByItemId.set(item.id, tag);
      const k = toolDisplayKey(item.name);
      if (!categoryByDisplayKey.has(k)) categoryByDisplayKey.set(k, tag);
    }
  }

  const choices: Record<string, string[]> = {};
  for (const { seg } of chooseSegments) choices[seg] = [];
  for (const tool of persisted) {
    const key = toolDisplayKey(tool.name);
    if (skip.has(key)) continue;
    const tag =
      (tool.ruleItemId ? categoryByItemId.get(tool.ruleItemId) : undefined) ??
      categoryByDisplayKey.get(key) ??
      null;
    const slot =
      chooseSegments.find(
        ({ seg, parsed }) =>
          (tag ? parsed.categoryTags.includes(tag) : true) && choices[seg].length < parsed.chooseN
      ) ?? chooseSegments.find(({ seg, parsed }) => choices[seg].length < parsed.chooseN);
    if (!slot) continue;
    choices[slot.seg].push(stripToolItemPriceSuffix(tool.name).trim());
  }

  return {
    toolProficiencyChoices: { ...(data.toolProficiencyChoices ?? {}), ...choices },
    persistedToolProficiencies: undefined,
  };
}
