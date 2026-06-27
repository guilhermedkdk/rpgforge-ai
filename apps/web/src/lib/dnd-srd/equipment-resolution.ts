import type { CharacterFormData } from './character-state';
import {
  parseEquipmentLine,
  resolveEquipmentItemId,
  resolveEquipmentToolPlaceholder,
  singularizeIfPlural,
  splitEquipmentBySource,
} from './equipment-utils';

interface PersistedEquipmentEntry {
  id: string;
  quantity: number;
}

/** Equipment lines whose chosen item lives under a source-scoped tool-choice key. */
const SCOPED_TOOL_PLACEHOLDERS: Record<string, string> = {
  'musical instrument of your choice': 'Musical Instrument of your choice',
};

const resolveEquipmentLine = (
  line: string,
  isBackground: boolean,
  toolChoices: Record<string, string[]>,
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
  index: number | null | undefined,
): string | null => (index != null ? (options?.options?.[index]?.text ?? null) : null);

/**
 * Resolves the sheet's equipment text into persisted `{ id, quantity }` entries.
 * Lines are split by source (class / background / manual) so each tool placeholder
 * resolves against the correct scoped choice; GP lines and unmatched names are skipped.
 */
export const resolveEquipmentPersistedItems = (
  data: CharacterFormData,
  itemIdByLookupKey: Map<string, string>,
): PersistedEquipmentEntry[] => {
  const toolChoices = data.toolProficiencyChoices ?? {};
  const holySymbolIds = data.holySymbolChoiceItemIds ?? { class: null, background: null };
  const { classLines, backgroundLines, manualLines } = splitEquipmentBySource(
    data.equipment ?? '',
    selectedOptionText(data.startingEquipmentOptions, data.startingEquipmentSelectedIndex),
    selectedOptionText(data.backgroundEquipmentOptions, data.backgroundEquipmentSelectedIndex),
  );

  const byId = new Map<string, PersistedEquipmentEntry>();
  const addById = (itemId: string, qty: number) => {
    const entry = byId.get(itemId);
    if (entry) entry.quantity += qty;
    else byId.set(itemId, { id: itemId, quantity: qty });
  };
  const accumulate = (line: string, isBackground: boolean) => {
    // Holy Symbol is an equipment item (not a tool proficiency): resolve the placeholder to the
    // chosen rule-item id directly, so the equipment items list is the single source of truth.
    if (line.trim().toLowerCase() === 'holy symbol') {
      const id = isBackground ? holySymbolIds.background : holySymbolIds.class;
      if (id) addById(id, 1);
      return;
    }
    const resolved = resolveEquipmentLine(line, isBackground, toolChoices);
    if (resolved === null) return;
    const { quantity, name } = parseEquipmentLine(resolved);
    if (name.trim().toUpperCase() === 'GP') return;
    const itemId = resolveEquipmentItemId(name, itemIdByLookupKey);
    if (!itemId) return;
    addById(itemId, Math.max(1, quantity));
  };

  for (const line of classLines) accumulate(line, false);
  for (const line of backgroundLines) accumulate(line, true);
  for (const line of manualLines) accumulate(line, false);
  return [...byId.values()];
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
  options: { gold?: number; preserveSelectionIndexes?: boolean } = {},
): Partial<CharacterFormData> | null => {
  const entries = prev.equipmentPersistedItems ?? [];
  const gold = options.gold ?? 0;
  if (entries.length === 0 && gold <= 0) return null;
  if ((prev.equipment ?? '').trim().length > 0) return null;
  if ((prev.equipmentSpentGP ?? 0) !== 0) return null;
  if ((prev.purchasedEquipment ?? []).length > 0) return null;

  const parts: string[] = [];
  if (gold > 0) parts.push(`${gold} GP`);
  for (const entry of entries) {
    const rawQty =
      typeof entry?.quantity === 'number' && Number.isFinite(entry.quantity) ? entry.quantity : 1;
    const quantity = Math.max(1, Math.trunc(rawQty));
    if (entry?.id) {
      const itemName = getItemName(entry.id) ?? entry.id;
      const label = singularizeIfPlural(stripPersistedItemLabel(itemName), quantity);
      parts.push(quantity > 1 ? `${quantity}x ${label}` : label);
      continue;
    }
    if (entry?.name) parts.push(quantity > 1 ? `${quantity}x ${entry.name}` : entry.name);
  }
  const equipment = parts.filter(Boolean).join('\n');
  if (!equipment) return null;

  return {
    equipment,
    equipmentSpentGP: 0,
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
