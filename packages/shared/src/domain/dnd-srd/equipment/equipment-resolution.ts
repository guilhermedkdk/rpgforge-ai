import type { CharacterFormData, EquipmentSource } from '../character/character-form-data';
import {
  parseEquipmentLine,
  singularizeIfPlural,
  splitEquipmentBySource,
} from '../options/character-options';
import {
  HOLY_SYMBOL_PLACEHOLDER_LINE,
  resolveEquipmentItemId,
  resolveEquipmentToolPlaceholder,
} from './equipment-lookup';

interface PersistedEquipmentEntry {
  id: string;
  quantity: number;
  source: EquipmentSource;
}

/** Equipment lines whose chosen item lives under a source-scoped tool-choice key. */
const SCOPED_TOOL_PLACEHOLDERS: Record<string, string> = {
  'musical instrument of your choice': 'Musical Instrument of your choice',
};

const resolveEquipmentLine = (
  line: string,
  isBackground: boolean,
  toolChoices: Record<string, string[]>
): string | null => {
  const scopedKey = SCOPED_TOOL_PLACEHOLDERS[line.trim().toLowerCase()];
  if (scopedKey) {
    const key = isBackground ? `${scopedKey} (Background)` : scopedKey;
    return toolChoices[key]?.[0] ?? null;
  }
  return resolveEquipmentToolPlaceholder(line, toolChoices);
};

const selectedOptionText = (
  options: { options: { text: string }[] } | null | undefined,
  index: number | null | undefined
): string | null => (index != null ? (options?.options?.[index]?.text ?? null) : null);

/**
 * Resolves the sheet's equipment text into persisted `{ id, quantity }` entries.
 * Lines are split by source (class / background / manual) so each tool placeholder
 * resolves against the correct scoped choice; GP lines and unmatched names are skipped.
 */
export const resolveEquipmentPersistedItems = (
  data: CharacterFormData,
  itemIdByLookupKey: Map<string, string>
): PersistedEquipmentEntry[] => {
  const toolChoices = data.toolProficiencyChoices ?? {};
  const holySymbolIds = data.holySymbolChoiceItemIds ?? { class: null, background: null };
  const { classLines, backgroundLines, manualLines } = splitEquipmentBySource(
    data.equipment ?? '',
    selectedOptionText(data.startingEquipmentOptions, data.startingEquipmentSelectedIndex),
    selectedOptionText(data.backgroundEquipmentOptions, data.backgroundEquipmentSelectedIndex),
    // The recorded map, or a save silently re-infers the source from text and undoes the recording:
    // a bundle's resolved placeholder ("Holy Symbol, Amulet)") matches no bundle line, so it came back
    // as 'manual' and the sheet showed it under "Additional equipment" after one round-trip.
    data.equipmentSourceByLine
  );

  // Keyed by item AND source: the same item granted by both bundles stays two rows, so each block
  // shows what it actually gave. Merging them (the previous behaviour) is what made a Robe from both
  // the class and the background collapse into one unattributable qty-2 line.
  const byKey = new Map<string, PersistedEquipmentEntry>();
  const addById = (itemId: string, qty: number, source: EquipmentSource) => {
    const key = `${source}:${itemId}`;
    const entry = byKey.get(key);
    if (entry) entry.quantity += qty;
    else byKey.set(key, { id: itemId, quantity: qty, source });
  };
  const accumulate = (line: string, source: EquipmentSource) => {
    const isBackground = source === 'background';
    // Holy Symbol is an equipment item (not a tool proficiency): resolve the placeholder to the
    // chosen rule-item id directly, so the equipment items list is the single source of truth.
    if (line.trim().toLowerCase() === HOLY_SYMBOL_PLACEHOLDER_LINE) {
      const id = isBackground ? holySymbolIds.background : holySymbolIds.class;
      if (id) addById(id, 1, source);
      return;
    }
    const resolved = resolveEquipmentLine(line, isBackground, toolChoices);
    if (resolved === null) return;
    const { quantity, name } = parseEquipmentLine(resolved);
    if (name.trim().toUpperCase() === 'GP') return;
    const itemId = resolveEquipmentItemId(name, itemIdByLookupKey);
    if (!itemId) return;
    addById(itemId, Math.max(1, quantity), source);
  };

  for (const line of classLines) accumulate(line, 'class');
  for (const line of backgroundLines) accumulate(line, 'background');
  for (const line of manualLines) accumulate(line, 'manual');
  return [...byKey.values()];
};

const stripPersistedItemLabel = (name: string): string => {
  const stripped = name
    .replace(/\s*\(\s*\d+(?:[.,]\d+)?\s*gp\s*\)\s*$/i, '')
    .replace(/\s*\(\d+\)\s*$/, '')
    .trim();
  return stripped || name;
};

/**
 * Rebuilds the editable equipment text from persisted `{ id | name, quantity }` entries
 * (schema v1 stores only the structured items array, not the text).
 * Returns null when the sheet still has live equipment state (text, purchases or spent GP),
 * so callers never overwrite in-progress edits.
 */
export const buildEquipmentRestorePatch = (
  prev: CharacterFormData,
  getItemName: (id: string) => string | undefined,
  options: {
    gold?: number;
    preserveSelectionIndexes?: boolean;
    /** Starting gold per bundle, so each amount is rebuilt inside its own block. */
    goldBySource?: { class?: number; background?: number };
  } = {}
): Partial<CharacterFormData> | null => {
  const entries = prev.equipmentPersistedItems ?? [];
  const gold = options.gold ?? 0;
  if (entries.length === 0 && gold <= 0) return null;
  if ((prev.equipment ?? '').trim().length > 0) return null;
  if ((prev.equipmentSpentGP ?? 0) !== 0) return null;
  if ((prev.purchasedEquipment ?? []).length > 0) return null;

  // Rebuilt GROUPED BY SOURCE, each bundle's gold inside its own group, and the line→source map is
  // handed back with it. Emitting one merged gold line and a flat item list is what made a bundle's
  // own gold and its resolved placeholder show up under "Additional": neither could be matched back
  // to the bundle text they came from.
  const goldBySource = options.goldBySource ?? {};
  const classGold = Math.max(0, Math.trunc(goldBySource.class ?? 0));
  const backgroundGold = Math.max(0, Math.trunc(goldBySource.background ?? 0));
  const bundleGold = classGold + backgroundGold;
  // A bundle's GP line always shows what the bundle GRANTED. Anything already spent out of it is not
  // subtracted from the line: it becomes `equipmentSpentGP`, so only the available total drops. This
  // is exactly how manual creation behaves, and deriving the spend here means it needs no field of
  // its own in the persisted shape. Any gold beyond the bundles is money the character just has.
  const spentGP = bundleGold > 0 ? Math.max(0, Math.round((bundleGold - gold) * 100) / 100) : 0;
  const manualGold = Math.max(0, Math.round((gold - bundleGold) * 100) / 100);

  const parts: string[] = [];
  const sourceByLine: EquipmentSource[] = [];
  const push = (line: string, source: EquipmentSource) => {
    parts.push(line);
    sourceByLine.push(source);
  };
  const pushItems = (source: EquipmentSource) => {
    for (const entry of entries) {
      // Sheets saved before the source existed carry none: they all read as 'manual', the same
      // bucket the old text matching gave them.
      if ((entry?.source ?? 'manual') !== source) continue;
      const rawQty =
        typeof entry?.quantity === 'number' && Number.isFinite(entry.quantity) ? entry.quantity : 1;
      const quantity = Math.max(1, Math.trunc(rawQty));
      if (entry?.id) {
        const itemName = getItemName(entry.id) ?? entry.id;
        const label = singularizeIfPlural(stripPersistedItemLabel(itemName), quantity);
        push(quantity > 1 ? `${quantity}x ${label}` : label, source);
        continue;
      }
      if (entry?.name) push(quantity > 1 ? `${quantity}x ${entry.name}` : entry.name, source);
    }
  };
  if (classGold > 0) push(`${classGold} GP`, 'class');
  pushItems('class');
  if (backgroundGold > 0) push(`${backgroundGold} GP`, 'background');
  pushItems('background');
  if (manualGold > 0) push(`${manualGold} GP`, 'manual');
  pushItems('manual');

  const equipment = parts.filter(Boolean).join('\n');
  if (!equipment) return null;

  return {
    equipment,
    equipmentSourceByLine: sourceByLine,
    equipmentSpentGP: spentGP,
    purchasedEquipment: [],
    startingEquipmentSelectedIndex: options.preserveSelectionIndexes
      ? (prev.startingEquipmentSelectedIndex ?? null)
      : null,
    backgroundEquipmentSelectedIndex: options.preserveSelectionIndexes
      ? (prev.backgroundEquipmentSelectedIndex ?? null)
      : null,
    equipmentGold: 0,
    equipmentPersistedItems: [],
  };
};
