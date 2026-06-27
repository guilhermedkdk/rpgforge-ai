import type { RuleItemKind } from '@rpgforce-ai/shared';
import { RuleItemKind as PrismaRuleItemKind } from '@prisma/client';
import { normalizeContentMdForKind } from './content-md-normalizer';
import { applyMechanics } from './mechanics/mechanics-derivation';

const KIND_MAP: Record<RuleItemKind, PrismaRuleItemKind> = {
  CLASS: 'CLASS',
  SUBCLASS: 'SUBCLASS',
  CLASS_FEATURE: 'CLASS_FEATURE',
  SPELL: 'SPELL',
  FEAT: 'FEAT',
  BACKGROUND: 'BACKGROUND',
  RACE: 'RACE',
  ABILITY: 'ABILITY',
  RULESET: 'RULESET',
  RULE: 'RULE',
  ITEM: 'ITEM',
  OTHER: 'OTHER',
};

function toPrismaKind(kind: RuleItemKind): PrismaRuleItemKind {
  return KIND_MAP[kind];
}

interface DocItem {
  document?: { key?: string };
  key?: string;
  name?: string;
  url?: string;
  desc?: string;
}

function getSourceKey(item: DocItem): string {
  return item.key ?? item.name ?? '';
}

function getContentMd(item: DocItem): string {
  return typeof item.desc === 'string' ? item.desc : '';
}

/** Document key for normalized; same treatment for every kind. Never store full document object in normalized. */
function getDocumentKey(raw: Record<string, unknown>): string | null {
  return (raw.document as { key?: string } | undefined)?.key ?? null;
}

function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

function stripUrls(value: unknown): unknown {
  if (value == null) return value;
  if (Array.isArray(value)) return value.map(stripUrls);
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(obj)) {
      if (key === 'url') continue;
      out[key] = stripUrls(obj[key]);
    }
    return out;
  }
  return value;
}

function keysToCamel(value: unknown): unknown {
  if (value == null) return value;
  if (Array.isArray(value)) return value.map(keysToCamel);
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(obj)) {
      out[snakeToCamel(key)] = keysToCamel(obj[key]);
    }
    return out;
  }
  return value;
}

function toCategoryKey(category: unknown): string | null {
  if (!category) return null;
  if (typeof category === 'object') {
    const cat = category as { key?: string; name?: string };
    if (typeof cat.key === 'string' && cat.key) return cat.key.toLowerCase();
    if (typeof cat.name === 'string' && cat.name)
      return cat.name.toLowerCase().replace(/\s+/g, '-');
    return null;
  }
  if (typeof category === 'string' && category) return category.toLowerCase().replace(/\s+/g, '-');
  return null;
}

/**
 * Open5e `key` values for SRD 2024 artisan supplies. We persist category as `artisan`
 * (not `tools`) so the DB reflects the intended equipment subgroup.
 */
const ARTISAN_TOOL_SOURCE_KEYS = new Set<string>([
  'srd-2024_alchemists-supplies',
  'srd-2024_brewers-supplies',
  'srd-2024_calligraphers-supplies',
  'srd-2024_carpenters-tools',
  'srd-2024_cartographers-tools',
  'srd-2024_cobblers-tools',
  'srd-2024_cooks-utensils',
  'srd-2024_glassblowers-tools',
  'srd-2024_jewelers-tools',
  'srd-2024_leatherworkers-tools',
  'srd-2024_masons-tools',
  'srd-2024_painters-supplies',
  'srd-2024_potters-tools',
  'srd-2024_smiths-tools',
  'srd-2024_tinkers-tools',
  'srd-2024_weavers-tools',
  'srd-2024_woodcarvers-tools',
]);

function applyArtisanToolCategoryOverride(raw: Record<string, unknown>): void {
  const key = typeof raw.key === 'string' ? raw.key.trim() : '';
  if (!key || !ARTISAN_TOOL_SOURCE_KEYS.has(key)) return;
  raw.category = { key: 'artisan', name: 'Artisan Tool' };
}

function buildItemNormalized(raw: Record<string, unknown>): Record<string, unknown> {
  const base = rawToNormalized(raw, ['document']);

  const category = raw.category as { key?: string; name?: string } | string | undefined;
  const categoryKey = toCategoryKey(category);
  const categoryName =
    category && typeof category === 'object'
      ? ((category as { name?: string }).name ?? null)
      : typeof category === 'string'
        ? category
        : null;

  return { ...base, categoryKey, categoryName };
}

function rawToNormalized(
  raw: Record<string, unknown>,
  excludeKeys: string[]
): Record<string, unknown> {
  const rest = Object.fromEntries(
    Object.entries(raw).filter(([key]) => !excludeKeys.includes(key))
  ) as Record<string, unknown>;
  const transformed = keysToCamel(stripUrls(rest)) as Record<string, unknown>;
  return { documentKey: getDocumentKey(raw), ...transformed };
}

export function mapOpen5eToRuleItemPayload(
  kind: RuleItemKind,
  item: DocItem & Record<string, unknown>,
  packId: string
): {
  packId: string;
  kind: PrismaRuleItemKind;
  sourceKey: string;
  sourceUrl: string | null;
  name: string;
  contentMd: string;
  raw: Record<string, unknown>;
  normalized: Record<string, unknown> | null;
} {
  const sourceKey = getSourceKey(item);
  const name = (item.name as string) ?? sourceKey;
  const raw = { ...item } as Record<string, unknown>;

  let contentMd: string;
  if (kind === 'CLASS' || kind === 'RACE' || kind === 'BACKGROUND') {
    contentMd = normalizeContentMdForKind(kind, raw);
    if (!contentMd.trim()) contentMd = getContentMd(item);
  } else {
    contentMd = '';
  }

  let normalized: Record<string, unknown> | null = null;
  if (kind === 'SPELL') {
    normalized = rawToNormalized(raw, ['document', 'classes']);
  } else if (kind === 'ITEM') {
    applyArtisanToolCategoryOverride(raw);
    normalized = buildItemNormalized(raw);
  } else if (
    kind === 'RULESET' ||
    kind === 'RULE' ||
    kind === 'FEAT' ||
    kind === 'CLASS' ||
    kind === 'SUBCLASS' ||
    kind === 'CLASS_FEATURE' ||
    kind === 'BACKGROUND' ||
    kind === 'RACE' ||
    kind === 'ABILITY'
  ) {
    normalized = rawToNormalized(raw, ['document']);
  }

  normalized = applyMechanics(kind, sourceKey, name, normalized);

  return {
    packId,
    kind: toPrismaKind(kind),
    sourceKey,
    sourceUrl: (item.url as string) ?? null,
    name,
    contentMd,
    raw,
    normalized,
  };
}
