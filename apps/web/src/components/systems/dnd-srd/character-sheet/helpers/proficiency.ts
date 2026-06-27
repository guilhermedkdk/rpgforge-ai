import type { RuleItemResponse } from '@rpgforce-ai/shared';
import type { CharacterFormData } from '@/lib/dnd-srd/character-state';
import type { PersistedProficiencies } from '@/lib/dnd-srd/character-persistence';
import { getEffectiveProficiencies } from '@/lib/dnd-srd/derived-character-stats';
import { ATTRIBUTES, TOOL_CATEGORY_TO_TAG } from '../constants';
import { normalizeStandardLanguageNames } from './language';

export interface WeaponProficiencyRule {
  category: 'simple' | 'martial';
  /** Tag-suffixes the weapon must have at least one of. Empty = no restriction. */
  anyOfProperties: string[];
}

export function parseWeaponProficiencyRules(proficiencies: string): WeaponProficiencyRule[] {
  const rules: WeaponProficiencyRule[] = [];
  const lines = (proficiencies ?? '').split('\n');
  const weaponLine = lines.find((l) => /weapon proficien/i.test(l));
  if (!weaponLine) return rules;

  const colonIdx = weaponLine.indexOf(':');
  const valuePart = colonIdx !== -1 ? weaponLine.slice(colonIdx + 1).trim() : weaponLine.trim();

  const segments = valuePart.split(',').map((s) => s.trim()).filter(Boolean);
  const joined: string[] = [];
  for (const seg of segments) {
    const lower = seg.toLowerCase();
    if (/^(simple|martial)/.test(lower)) joined.push(seg);
    else if (joined.length > 0) joined[joined.length - 1] += `, ${seg}`;
    else joined.push(seg);
  }

  for (const entry of joined) {
    const lower = entry.toLowerCase();
    const conditionalMatches = lower.matchAll(
      /(simple|martial)\s+weapons?\s+that\s+have\s+(?:the\s+)?(.+?)\s+propert/g
    );
    const conditionalCategories = new Set<'simple' | 'martial'>();
    for (const match of conditionalMatches) {
      const category = match[1] as 'simple' | 'martial';
      conditionalCategories.add(category);
      const anyOfProperties = match[2]
        .split(/\s+or\s+|\s+and\s+/i)
        .map((p) => p.trim().replace(/^the\s+/i, '').toLowerCase())
        .filter(Boolean);
      rules.push({ category, anyOfProperties });
    }
    if (lower.includes('simple') && !conditionalCategories.has('simple'))
      rules.push({ category: 'simple', anyOfProperties: [] });
    if (lower.includes('martial') && !conditionalCategories.has('martial'))
      rules.push({ category: 'martial', anyOfProperties: [] });
  }

  return rules;
}

export function isWeaponProficientByRules(
  weaponCategory: 'simple' | 'martial' | undefined,
  weaponTagKeys: string[],
  rules: WeaponProficiencyRule[]
): boolean {
  if (!weaponCategory) return false;
  for (const rule of rules) {
    if (rule.category !== weaponCategory) continue;
    if (rule.anyOfProperties.length === 0) return true;
    const hasRequiredProp = rule.anyOfProperties.some((prop) =>
      weaponTagKeys.includes(`weapon:property:${prop}`)
    );
    if (hasRequiredProp) return true;
  }
  return false;
}

export function parseProficiencyValueItems(valueStr: string, label: string): string[] {
  const byComma = valueStr.split(/\s*,\s*/).map((s) => s.trim());
  const byAnd = byComma.flatMap((s) => s.split(/\s+and\s+/i).map((p) => p.trim()));
  let items = byAnd.filter(Boolean).map((s) => s.replace(/^\s*and\s+/i, '').trim()).filter(Boolean);

  const lowerLabel = label.toLowerCase();
  if (lowerLabel.includes('weapon')) {
    items = items.map((s) => s.replace(/\s+weapons?\s*$/i, '').trim()).filter(Boolean);
  }
  if (lowerLabel.includes('armor')) {
    const armorItem = items.find((s) => /\barmors?\s*$/i.test(s));
    if (armorItem) {
      const armorSuffixMatch = armorItem.match(/\b(armors?)\s*$/i);
      const armorSuffix = armorSuffixMatch ? armorSuffixMatch[1] : 'armor';
      items = items.map((s) => {
        if (/\barmors?\s*$/i.test(s) || /shield(s)?\s*$/i.test(s)) return s.trim();
        return `${s} ${armorSuffix}`.trim();
      });
    }
  }

  return items;
}

export type ParsedToolChoose = {
  chooseN: number;
  categoryTags: string[];
  categoryLabel: string;
};

function phraseToToolCategorySlug(phrase: string): string | null {
  const normalized = phrase
    .trim()
    .toLowerCase()
    .replace(/[‘’']/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
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
  for (const part of rest.split(/\s+or\s+/i).map((p) => p.trim()).filter(Boolean)) {
    const slug = phraseToToolCategorySlug(part);
    if (!slug) continue;
    const tag = `item:category:${slug}`;
    if (!categoryTags.includes(tag)) categoryTags.push(tag);
  }
  if (categoryTags.length === 0) return null;
  return { chooseN, categoryTags, categoryLabel: rest };
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
 * (e.g. "Musical Instrument, Shawm" → "tool:musical-instrument-shawm"). Punctuation is stripped so
 * the key stays clean — single source of truth shared by the picker, the resolver and the display.
 */
export function skilledToolChoiceKey(label: string): string {
  const slug = stripToolItemPriceSuffix(label)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `tool:${slug}`;
}

export function dedupeRuleItemsByToolDisplay(items: RuleItemResponse[]): RuleItemResponse[] {
  const seen = new Set<string>();
  const out: RuleItemResponse[] = [];
  for (const item of items) {
    const k = toolDisplayKey(item.name);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  return out;
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

export function updateToolProficiencyChoices(
  data: CharacterFormData,
  onChange: (d: CharacterFormData) => void,
  valueStr: string,
  chosenNames: string[]
) {
  const next = { ...(data.toolProficiencyChoices ?? {}), [valueStr]: chosenNames };
  onChange({ ...data, toolProficiencyChoices: next });
}

export interface ProficiencyResolutionContext {
  toolItemsByCategory: Record<string, RuleItemResponse[]>;
  standardLanguageOptions: RuleItemResponse[];
}

/** Concatenated value of every proficiency line whose label matches `labelRe`. */
function readProficiencyLineValue(data: CharacterFormData, labelRe: RegExp): string {
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

function armorLabelToKey(label: string): string {
  const l = label.trim().toLowerCase();
  if (l.includes('light')) return 'light';
  if (l.includes('medium')) return 'medium';
  if (l.includes('heavy')) return 'heavy';
  if (l.includes('shield')) return 'shield';
  return l.replace(/\s+/g, '-');
}

function weaponLabelToKey(label: string): string {
  const l = label.trim().toLowerCase();
  if (l === 'simple') return 'simple';
  if (l === 'martial') return 'martial';
  return l.replace(/\s+/g, '-');
}

function buildToolItemByDisplayKey(
  toolItemsByCategory: Record<string, RuleItemResponse[]>
): Map<string, RuleItemResponse> {
  const map = new Map<string, RuleItemResponse>();
  for (const item of Object.values(toolItemsByCategory).flat()) {
    const k = toolDisplayKey(item.name);
    if (!map.has(k)) map.set(k, item);
  }
  return map;
}

/** Maps each Skilled-feat `tool:<slug>` choice key back to its human label via the tool catalog. */
function buildSkilledToolKeyToLabel(
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

/**
 * Builds the fully resolved proficiency snapshot persisted under `proficiencies`. Saves/skills are
 * canonical keys; armor/weapons are category keys parsed from the derived proficiency lines; tools
 * and languages resolve to `{ ruleItemId, name }` (id is the canonical link, name is denormalized so
 * viewers don't need a lookup). Tools combine fixed grants, "Choose…" picks and Skilled-feat picks.
 */
export function buildResolvedProficiencies(
  data: CharacterFormData,
  ctx: ProficiencyResolutionContext
): PersistedProficiencies {
  const savingThrows = ATTRIBUTES.filter((a) => data.savingThrows?.[a]);
  const skills = Object.keys(data.skillProficiencies ?? {})
    .filter((k) => data.skillProficiencies?.[k])
    .sort();

  const armorValue = readProficiencyLineValue(data, /armor|shield/i);
  const armor = dedupeProficiencyLabelsPreserveOrder(
    parseProficiencyValueItems(armorValue, 'armor').map(armorLabelToKey)
  );

  const weaponValue = readProficiencyLineValue(data, /weapon/i);
  const weapons = dedupeProficiencyLabelsPreserveOrder(
    parseProficiencyValueItems(weaponValue, 'weapon').map(weaponLabelToKey)
  );

  const toolValue = readProficiencyLineValue(data, /tool/i);
  const fixedToolNames: string[] = [];
  for (const seg of dedupeProficiencyLabelsPreserveOrder(
    toolValue.split(/\s*,\s*/).map((s) => s.trim()).filter(Boolean)
  )) {
    if (!parseToolProficiencyChoose(seg)) fixedToolNames.push(stripToolItemPriceSuffix(seg));
  }
  // Only genuine tool-proficiency "Choose…" slots — skip equipment placeholders sharing this map
  // (e.g. "Musical Instrument of your choice", which is a starting-equipment item, not a tool prof).
  const choicePicks = Object.entries(data.toolProficiencyChoices ?? {})
    .filter(([key]) => parseToolProficiencyChoose(key) != null)
    .flatMap(([, names]) => names);
  const skilledKeyToLabel = buildSkilledToolKeyToLabel(ctx.toolItemsByCategory);
  const skilledToolNames = (data.skilledProficiencyChoices ?? [])
    .filter((c) => c.startsWith('tool:'))
    .map((c) => skilledKeyToLabel.get(c) ?? c.slice('tool:'.length));

  const toolItemByDisplayKey = buildToolItemByDisplayKey(ctx.toolItemsByCategory);
  const tools: PersistedProficiencies['tools'] = [];
  const seenTool = new Set<string>();
  for (const rawName of [...fixedToolNames, ...choicePicks, ...skilledToolNames]) {
    const display = stripToolItemPriceSuffix(rawName).trim();
    if (!display) continue;
    const key = toolDisplayKey(rawName);
    if (seenTool.has(key)) continue;
    seenTool.add(key);
    const item = toolItemByDisplayKey.get(key) ?? null;
    tools.push({
      ruleItemId: item?.id ?? null,
      name: item ? stripToolItemPriceSuffix(item.name).trim() : display,
    });
  }

  const langByLower = new Map<string, RuleItemResponse>();
  for (const o of ctx.standardLanguageOptions) langByLower.set(o.name.trim().toLowerCase(), o);
  const languages: PersistedProficiencies['languages'] = normalizeStandardLanguageNames(
    data.standardLanguageNames,
    ctx.standardLanguageOptions
  ).map((n) => {
    const o = langByLower.get(n.trim().toLowerCase()) ?? null;
    return { ruleItemId: o?.id ?? null, name: o ? o.name.trim() : n.trim() };
  });

  return { savingThrows, skills, armor, weapons, tools, languages };
}

/**
 * On load, redistributes the flat `persistedToolProficiencies` snapshot into the derived "Choose…"
 * slots (`toolProficiencyChoices`), matching each tool to a slot by category. Tools already covered
 * by fixed grants or the Skilled feat are skipped (those re-derive). Returns the patch to apply, or
 * null when there's nothing to do — including while the derivation / tool catalog is still loading,
 * so picks are never dropped prematurely.
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
    toolValue.split(/\s*,\s*/).map((s) => s.trim()).filter(Boolean)
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
