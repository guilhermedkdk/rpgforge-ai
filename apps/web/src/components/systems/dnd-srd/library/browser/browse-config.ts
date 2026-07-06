import { Award, BookOpen, Backpack, Briefcase, Sparkles, Swords, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { RuleItemKind, RuleItemResponse } from '@rpgforce-ai/shared';

export type BrowseCategoryKey =
  | 'classes'
  | 'species'
  | 'backgrounds'
  | 'feats'
  | 'spells'
  | 'equipment'
  | 'rules';

export interface BrowseCategory {
  key: BrowseCategoryKey;
  label: string;
  icon: LucideIcon;
  searchPlaceholder: string;
}

export const BROWSE_CATEGORIES: readonly BrowseCategory[] = [
  { key: 'classes', label: 'Classes', icon: Swords, searchPlaceholder: 'Buscar classes…' },
  { key: 'species', label: 'Species', icon: Users, searchPlaceholder: 'Buscar species…' },
  {
    key: 'backgrounds',
    label: 'Backgrounds',
    icon: Briefcase,
    searchPlaceholder: 'Buscar backgrounds…',
  },
  { key: 'feats', label: 'Feats', icon: Award, searchPlaceholder: 'Buscar feats…' },
  { key: 'spells', label: 'Spells', icon: Sparkles, searchPlaceholder: 'Buscar spells…' },
  { key: 'equipment', label: 'Equipment', icon: Backpack, searchPlaceholder: 'Buscar equipment…' },
  { key: 'rules', label: 'Rules', icon: BookOpen, searchPlaceholder: 'Buscar rules…' },
];

export const DEFAULT_BROWSE_CATEGORY: BrowseCategoryKey = 'classes';

/** Browse category an item belongs to — drives the detail page's back link. */
export const CATEGORY_BY_KIND: Partial<Record<RuleItemKind, BrowseCategoryKey>> = {
  CLASS: 'classes',
  SUBCLASS: 'classes',
  CLASS_FEATURE: 'classes',
  RACE: 'species',
  BACKGROUND: 'backgrounds',
  FEAT: 'feats',
  SPELL: 'spells',
  ITEM: 'equipment',
  RULESET: 'rules',
  RULE: 'rules',
};

export const SPELL_SCHOOL_TAG_PREFIX = 'spell:school:';
export const SPELL_CLASS_TAG_PREFIX = 'spell:class:';
export const ITEM_CATEGORY_TAG_PREFIX = 'item:category:';
export const ITEM_RARITY_TAG_PREFIX = 'item:rarity:';
export const ITEM_MAGIC_YES_TAG = 'item:magic:yes';
export const ITEM_MAGIC_NO_TAG = 'item:magic:no';

/** 'wondrous-item' → 'Wondrous Item'. */
export const prettifyTagValue = (value: string): string =>
  value
    .split('-')
    .map((part) => (part ? part.charAt(0).toUpperCase() + part.slice(1) : part))
    .join(' ');

export const tagValueForPrefix = (item: RuleItemResponse, prefix: string): string | null => {
  const tag = item.tagKeys.find((t) => t.startsWith(prefix));
  return tag ? tag.slice(prefix.length) : null;
};

export const tagValuesForPrefix = (item: RuleItemResponse, prefix: string): string[] =>
  item.tagKeys.filter((t) => t.startsWith(prefix)).map((t) => t.slice(prefix.length));

export interface FilterOption {
  value: string;
  label: string;
  count: number;
}

/** Distinct values of a tag prefix across `items`, with counts, sorted by label. */
export const filterOptionsFromTagPrefix = (
  items: RuleItemResponse[],
  prefix: string
): FilterOption[] => {
  const counts = new Map<string, number>();
  for (const item of items) {
    for (const value of tagValuesForPrefix(item, prefix)) {
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, label: prettifyTagValue(value), count }))
    .sort((a, b) => a.label.localeCompare(b.label));
};

const MARKDOWN_NOISE_LINE = /^(\s*[#>|].*|\s*Table:.*)$/;

/** First readable sentence(s) of a markdown block for card snippets. */
export const plainTextSnippet = (md: string | undefined | null, maxLength = 220): string => {
  if (!md?.trim()) return '';
  const paragraph = md
    .split('\n')
    .filter((line) => line.trim() && !MARKDOWN_NOISE_LINE.test(line))
    .join(' ');
  const plain = paragraph
    .replace(/\*\*|\*|_|`/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .trim();
  return plain.length > maxLength ? `${plain.slice(0, maxLength).trimEnd()}…` : plain;
};

export const normalizedString = (item: RuleItemResponse, key: string): string | null => {
  const value = (item.normalized as Record<string, unknown> | undefined)?.[key];
  return typeof value === 'string' && value.trim() ? value : null;
};
