export const RULE_ITEM_KINDS = [
  'CLASS',
  'SUBCLASS',
  'CLASS_FEATURE',
  'SPELL',
  'FEAT',
  'BACKGROUND',
  'RACE',
  'ABILITY',
  'RULESET',
  'RULE',
  'ITEM',
  'OTHER',
] as const;

export type RuleItemKind = (typeof RULE_ITEM_KINDS)[number];

export const RULE_RELATION_TYPES = [
  'SUBCLASS_OF',
  'CLASS_HAS_FEATURE',
  'SUBCLASS_HAS_FEATURE',
  'SPELL_AVAILABLE_TO_CLASS',
  'RULESET_HAS_RULE',
] as const;

export type RuleRelationType = (typeof RULE_RELATION_TYPES)[number];

export interface RuleItemResponse {
  id: string;
  packId: string;
  kind: RuleItemKind;
  source: string;
  sourceKey: string;
  sourceUrl?: string;
  sourceVersion?: string;
  name: string;
  slug?: string;
  contentMd?: string;
  raw: Record<string, unknown>;
  normalized?: Record<string, unknown>;
  tagKeys: string[];
  createdAt: string;
  updatedAt: string;
}

export interface RuleItemListParams {
  packId?: string;
  type?: RuleItemKind;
  q?: string;
  level?: number;
  class?: string;
  /** Single tag (backward compat). */
  tag?: string;
  /** Multiple tags (AND): item must have all. */
  tags?: string[];
  limit?: number;
  offset?: number;
  /** When false, omits the heavy `raw` payload (consumers read `normalized`). */
  includeRaw?: boolean;
}

export interface RuleItemListResult {
  items: RuleItemResponse[];
  total: number;
}

/** One named query inside a batch request; mirrors a single `GET /rule-items` call. */
export interface RuleItemBatchQuery {
  key: string;
  type?: RuleItemKind;
  q?: string;
  level?: number;
  class?: string;
  tag?: string | string[];
  limit?: number;
  offset?: number;
  includeRaw?: boolean;
}

export interface RuleItemBatchRequest {
  packId?: string;
  queries: RuleItemBatchQuery[];
}

/** Batch response keyed by each query's `key`. */
export type RuleItemBatchResult = Record<string, RuleItemListResult>;

export interface NormalizedSpell {
  level: number;
  school: string;
  ritual?: boolean;
  concentration?: boolean;
  damageTypes?: string[];
  save?: string;
  range?: string;
  castingTime?: string;
  duration?: string;
}

export interface NormalizedWeapon {
  category: 'simple' | 'martial';
  damage?: string;
  damageType?: string;
  properties?: string[];
  range?: number | null;
}

export interface NormalizedArmor {
  category: 'light' | 'medium' | 'heavy' | 'shield';
  baseAC?: number;
  dexCap?: number | null;
  strengthMin?: number | null;
  stealthDisadvantage?: boolean;
}
