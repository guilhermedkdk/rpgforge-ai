import type { RuleItemListParams, RuleItemResponse } from '@rpgforce-ai/shared';
import { STANDARD_LANGUAGE_TAG } from '@/components/systems/dnd-srd/character-sheet/constants';

/** Potions allowed in the gear picker (creation flow offers only basic consumables). */
const ALLOWED_POTION_NAMES: ReadonlySet<string> = new Set([
  'Potion of Healing',
  'Antitoxin',
]);

export type RuleLibraryKey =
  | 'classes'
  | 'backgrounds'
  | 'races'
  | 'abilities'
  | 'feats'
  | 'weapons'
  | 'unarmedStrike'
  | 'armors'
  | 'gamingSets'
  | 'musicalInstruments'
  | 'artisanTools'
  | 'tools'
  | 'standardLanguages'
  | 'adventuringGear'
  | 'equipmentPacks'
  | 'scrolls'
  | 'ammunition'
  | 'potions'
  | 'spellcastingFocus'
  | 'allItems';

export interface RuleLibraryQueryConfig {
  key: RuleLibraryKey;
  params?: Omit<RuleItemListParams, 'packId' | 'offset'>;
  /** Sliced client-side from `allItems` by AND-matching these tags (no own request). */
  itemTags?: readonly string[];
  includeRaw?: boolean;
  postFilter?: (items: RuleItemResponse[]) => RuleItemResponse[];
}

export const RULE_LIBRARY_QUERIES: readonly RuleLibraryQueryConfig[] = [
  { key: 'classes', params: { type: 'CLASS', limit: 100 } },
  { key: 'backgrounds', params: { type: 'BACKGROUND', limit: 100 } },
  { key: 'races', params: { type: 'RACE', limit: 100 } },
  { key: 'abilities', params: { type: 'ABILITY', limit: 100 } },
  { key: 'feats', params: { type: 'FEAT', limit: 200 } },
  {
    // Base attack always shown; kind OTHER (untagged), so not in `allItems`.
    key: 'unarmedStrike',
    params: { q: 'Unarmed Strike', limit: 5 },
    postFilter: (items) =>
      items.filter((i) => i.name.trim().toLowerCase() === 'unarmed strike').slice(0, 1),
  },
  {
    key: 'standardLanguages',
    params: { type: 'OTHER', tags: [STANDARD_LANGUAGE_TAG], limit: 100 },
  },
  {
    // Full ITEM catalog: source for every `itemTags` sub-catalog and the save-time id lookup.
    key: 'allItems',
    params: { type: 'ITEM', limit: 10000 },
    includeRaw: false,
  },

  // Derived from `allItems` (no request) — AND-matched on item tags.
  { key: 'weapons', itemTags: ['item:category:weapon', 'item:weapon:yes', 'item:magic:no'] },
  { key: 'armors', itemTags: ['item:category:armor', 'item:armor:yes', 'item:magic:no'] },
  { key: 'gamingSets', itemTags: ['item:category:gaming-set'] },
  { key: 'musicalInstruments', itemTags: ['item:category:musical-instrument'] },
  { key: 'artisanTools', itemTags: ['item:category:artisan'] },
  { key: 'tools', itemTags: ['item:category:tools'] },
  { key: 'adventuringGear', itemTags: ['item:category:adventuring-gear'] },
  { key: 'equipmentPacks', itemTags: ['item:category:equipment-pack'] },
  { key: 'scrolls', itemTags: ['item:category:scroll'] },
  { key: 'ammunition', itemTags: ['item:category:ammunition'] },
  {
    key: 'potions',
    itemTags: ['item:category:potion'],
    postFilter: (items) => items.filter((i) => ALLOWED_POTION_NAMES.has(i.name)),
  },
  { key: 'spellcastingFocus', itemTags: ['item:category:spellcasting-focus'] },
];

/** Source lists merged (deduped by id) into the gear picker. */
export const ADVENTURING_GEAR_GROUP_KEYS: readonly RuleLibraryKey[] = [
  'adventuringGear',
  'equipmentPacks',
  'scrolls',
  'potions',
  'ammunition',
  'spellcastingFocus',
];

export const EDITOR_LIBRARY_KEYS: readonly RuleLibraryKey[] = RULE_LIBRARY_QUERIES.map(
  (q) => q.key,
);

/** The session viewer preloads everything sheet-specific; only item catalogs are fetched. */
export const SESSION_LIBRARY_KEYS: readonly RuleLibraryKey[] = [
  'weapons',
  'unarmedStrike',
  'armors',
  ...ADVENTURING_GEAR_GROUP_KEYS,
];
