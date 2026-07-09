/**
 * Content with no (correct) Open5e catalog entry, authored here directly from the SRD 5.2 rules
 * text so it's a normal, versioned part of the ingestion pipeline instead of a one-off manual DB
 * edit. Mapped through the same `upsertRuleItem` pipeline as everything else fetched from Open5e.
 */

/**
 * Standard/rare split per SRD 5.2 (2024 rules). Open5e's `/v2/languages/` endpoint returns the
 * 2014-rules classification (Draconic is "exotic" there; Druidic/Thieves' Cant are "standard"),
 * is missing "Common Sign Language" (added in 2024), and includes "Void Speech", which isn't part
 * of the SRD 5.2 language list — so it's hardcoded here instead of fetched.
 */
export const SYNTHETIC_LANGUAGES: Record<string, unknown>[] = [
  // --- Standard (10) ---
  { key: 'manual-lang-common', name: 'Common', languageRarity: 'standard' },
  {
    key: 'manual-lang-common-sign-language',
    name: 'Common Sign Language',
    languageRarity: 'standard',
  },
  { key: 'manual-lang-draconic', name: 'Draconic', languageRarity: 'standard' },
  { key: 'manual-lang-dwarvish', name: 'Dwarvish', languageRarity: 'standard' },
  { key: 'manual-lang-elvish', name: 'Elvish', languageRarity: 'standard' },
  { key: 'manual-lang-giant', name: 'Giant', languageRarity: 'standard' },
  { key: 'manual-lang-gnomish', name: 'Gnomish', languageRarity: 'standard' },
  { key: 'manual-lang-goblin', name: 'Goblin', languageRarity: 'standard' },
  { key: 'manual-lang-halfling', name: 'Halfling', languageRarity: 'standard' },
  { key: 'manual-lang-orc', name: 'Orc', languageRarity: 'standard' },
  // --- Rare (9) ---
  { key: 'manual-lang-abyssal', name: 'Abyssal', languageRarity: 'rare' },
  { key: 'manual-lang-celestial', name: 'Celestial', languageRarity: 'rare' },
  { key: 'manual-lang-deep-speech', name: 'Deep Speech', languageRarity: 'rare' },
  { key: 'manual-lang-druidic', name: 'Druidic', languageRarity: 'rare' },
  { key: 'manual-lang-infernal', name: 'Infernal', languageRarity: 'rare' },
  { key: 'manual-lang-primordial', name: 'Primordial', languageRarity: 'rare' },
  { key: 'manual-lang-sylvan', name: 'Sylvan', languageRarity: 'rare' },
  { key: 'manual-lang-thieves-cant', name: "Thieves' Cant", languageRarity: 'rare' },
  { key: 'manual-lang-undercommon', name: 'Undercommon', languageRarity: 'rare' },
];

/** Mapped as kind OTHER (no Open5e catalog entry for this rule text at all). */
export const SYNTHETIC_OTHER_ITEMS: Record<string, unknown>[] = [
  {
    key: 'unarmed-strike',
    name: 'Unarmed Strike',
    desc: 'Instead of using a weapon to make a melee attack, you can use a punch, kick, head-butt, or similar forceful blow. In game terms, this is an Unarmed Strike, a special melee attack that deals 1 Bludgeoning damage plus your Strength modifier on a hit.',
    damage: '1',
    damageType: 'Bludgeoning',
  },
];

const ARCANE_FOCUS_DOCUMENT = {
  key: 'srd-2024',
  name: 'System Reference Document 5.2',
  type: 'SOURCE',
  display_name: '5e 2024 Rules',
  publisher: { key: 'wizards-of-the-coast', name: 'Wizards of the Coast' },
  gamesystem: { key: '5e-2024', name: '5th Edition 2024' },
  permalink: 'https://dnd.wizards.com/resources/systems-reference-document',
};

const ARCANE_FOCUS_CATEGORY = {
  key: 'spellcasting-focus',
  name: 'Spellcasting Focus',
  url: 'https://api.open5e.com/v2/itemcategories/spellcasting-focus/',
};

const ARCANE_FOCUS_DESC =
  'An Arcane Focus takes one of the forms in the Arcane Focuses table and is bejeweled or carved ' +
  'to channel arcane magic. A Sorcerer, Warlock, or Wizard can use such an item as a Spellcasting Focus.';

const ARCANE_FOCUS_STAFF_DESC = `${ARCANE_FOCUS_DESC} This staff can also be used as a Quarterstaff.`;

/**
 * Not available via Open5e's srd-2024 `/items/` or `/magicitems/` (only Druidic Focus variants
 * are ingested from there) — mapped as kind ITEM, same shape as a real Open5e item so the
 * existing ITEM mapper/tag-derivation pipeline handles them without any special-casing.
 */
export const SYNTHETIC_ITEM_ITEMS: Record<string, unknown>[] = [
  {
    key: 'srd-2024_arcane-focus-crystal',
    name: 'Arcane Focus, Crystal',
    desc: ARCANE_FOCUS_DESC,
    category: ARCANE_FOCUS_CATEGORY,
    weapon: null,
    armor: null,
    rarity: null,
    size: { key: 'tiny', name: 'Tiny' },
    weight: '1.000',
    weight_unit: 'lb',
    cost: '10.00',
    is_magic_item: false,
    requires_attunement: false,
    attunement_detail: null,
    document: ARCANE_FOCUS_DOCUMENT,
  },
  {
    key: 'srd-2024_arcane-focus-orb',
    name: 'Arcane Focus, Orb',
    desc: ARCANE_FOCUS_DESC,
    category: ARCANE_FOCUS_CATEGORY,
    weapon: null,
    armor: null,
    rarity: null,
    size: { key: 'tiny', name: 'Tiny' },
    weight: '3.000',
    weight_unit: 'lb',
    cost: '20.00',
    is_magic_item: false,
    requires_attunement: false,
    attunement_detail: null,
    document: ARCANE_FOCUS_DOCUMENT,
  },
  {
    key: 'srd-2024_arcane-focus-rod',
    name: 'Arcane Focus, Rod',
    desc: ARCANE_FOCUS_DESC,
    category: ARCANE_FOCUS_CATEGORY,
    weapon: null,
    armor: null,
    rarity: null,
    size: { key: 'tiny', name: 'Tiny' },
    weight: '2.000',
    weight_unit: 'lb',
    cost: '10.00',
    is_magic_item: false,
    requires_attunement: false,
    attunement_detail: null,
    document: ARCANE_FOCUS_DOCUMENT,
  },
  {
    key: 'srd-2024_arcane-focus-staff',
    name: 'Arcane Focus, Staff',
    desc: ARCANE_FOCUS_STAFF_DESC,
    category: ARCANE_FOCUS_CATEGORY,
    weapon: null,
    armor: null,
    rarity: null,
    size: { key: 'tiny', name: 'Tiny' },
    weight: '4.000',
    weight_unit: 'lb',
    cost: '5.00',
    is_magic_item: false,
    requires_attunement: false,
    attunement_detail: null,
    document: ARCANE_FOCUS_DOCUMENT,
  },
  {
    key: 'srd-2024_arcane-focus-wand',
    name: 'Arcane Focus, Wand',
    desc: ARCANE_FOCUS_DESC,
    category: ARCANE_FOCUS_CATEGORY,
    weapon: null,
    armor: null,
    rarity: null,
    size: { key: 'tiny', name: 'Tiny' },
    weight: '1.000',
    weight_unit: 'lb',
    cost: '10.00',
    is_magic_item: false,
    requires_attunement: false,
    attunement_detail: null,
    document: ARCANE_FOCUS_DOCUMENT,
  },
];
