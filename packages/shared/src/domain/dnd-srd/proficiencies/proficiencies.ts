/**
 * Weapon/armor proficiency parsing + the fully-resolved proficiency snapshot builder
 * (`buildResolvedProficiencies`). Pure — all catalog data is passed in via the context.
 */
import type { RuleItemResponse } from '../../../types/ruleitem';
import type { CharacterFormData } from '../character/character-form-data';
import type { PersistedProficiencies } from '../character/character-persistence';
import { DND_ATTRIBUTES } from '../derivation/ability-progression';
import { normalizeStandardLanguageNames } from './languages';
import {
  buildSkilledToolKeyToLabel,
  dedupeProficiencyLabelsPreserveOrder,
  parseToolProficiencyChoose,
  readProficiencyLineValue,
  stripToolItemPriceSuffix,
  toolDisplayKey,
} from './tool-proficiencies';

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

  const segments = valuePart
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
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
        .map((p) =>
          p
            .trim()
            .replace(/^the\s+/i, '')
            .toLowerCase()
        )
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
  let items = byAnd
    .filter(Boolean)
    .map((s) => s.replace(/^\s*and\s+/i, '').trim())
    .filter(Boolean);

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

export interface ProficiencyResolutionContext {
  toolItemsByCategory: Record<string, RuleItemResponse[]>;
  standardLanguageOptions: RuleItemResponse[];
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
  const savingThrows = DND_ATTRIBUTES.filter((a) => data.savingThrows?.[a]);
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
    toolValue
      .split(/\s*,\s*/)
      .map((s) => s.trim())
      .filter(Boolean)
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
