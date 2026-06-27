/**
 * Shared parsing and splitting for class/background starting equipment.
 * Used by derived-character-stats (applyDerived) and character-sheet (display).
 */

function parseStartingEquipmentSegments(optionText: string): string[] {
  return optionText
    .split(/\s*,\s*/)
    .map((s) => s.replace(/^\s*and\s+/i, '').trim())
    .filter(Boolean);
}

/**
 * Singularizes an item name when qty > 1, matching how plural forms appear in option texts.
 * Handles the -es plural for words ending in -ch/-sh/-s/-z (e.g. Pouches→Pouch, Torches→Torch)
 * and the regular -s plural for everything else (e.g. Arrows→Arrow, Handaxes→Handaxe).
 * GP lines and qty ≤ 1 are left unchanged.
 */
export function singularizeIfPlural(name: string, qty: number): string {
  if (qty <= 1 || !name.endsWith('s') || /(?:^|\s)GP$/i.test(name)) return name;
  if (/(?:ch|sh|[sz])es$/i.test(name)) return name.slice(0, -2);
  return name.slice(0, -1);
}

/** Parses option text into items (quantity, name); plural normalized for quantity > 1. */
export function parseStartingEquipmentOptionItems(
  optionText: string
): { quantity: number; name: string }[] {
  return parseStartingEquipmentSegments(optionText).map((segment) => {
    const numPrefix = segment.match(/^(\d+)\s+(.+)$/);
    let quantity = 1;
    let name = segment;
    if (numPrefix) {
      quantity = Math.max(1, parseInt(numPrefix[1], 10));
      name = singularizeIfPlural(numPrefix[2].trim(), quantity);
    }
    // Detect "(N word)" bundle suffix — e.g. "Parchment (10 sheets)" → qty 10, name "Parchment".
    // Requires exactly one non-GP word after the number so "(10 GP)" and "(prayers)" are unaffected.
    const bundleSuffix = name.match(/^(.*?)\s*\((\d+)\s+(?!gp\b)(\w+)\)\s*$/i);
    if (bundleSuffix) {
      quantity = Math.max(1, parseInt(bundleSuffix[2], 10));
      name = bundleSuffix[1].trim();
    }
    return { quantity, name };
  });
}

/** Parses one equipment line: "Nx Name", "N GP", "Name (N unit)" or "Name" → { quantity, name }. */
export function parseEquipmentLine(line: string): { quantity: number; name: string } {
  const trimmed = line.trim();
  const gpMatch = trimmed.match(/^(\d+(?:\.\d+)?)\s+GP$/i);
  if (gpMatch) {
    return { quantity: Math.max(0, parseFloat(gpMatch[1])), name: 'GP' };
  }
  const match = trimmed.match(/^(\d+)\s*x\s+(.+)$/i);
  if (match) {
    return { quantity: Math.max(1, parseInt(match[1], 10)), name: match[2].trim() };
  }
  // Detect "(N word)" bundle suffix — e.g. "Parchment (10 sheets)" → qty 10, name "Parchment".
  // The (?!gp\b) lookahead prevents matching price suffixes like "(10 gp)".
  const bundleMatch = trimmed.match(/^(.*?)\s*\((\d+)\s+(?!gp\b)\w+\)\s*$/i);
  if (bundleMatch) {
    const qty = Math.max(1, parseInt(bundleMatch[2], 10));
    return { quantity: qty, name: bundleMatch[1].trim() };
  }
  return { quantity: 1, name: trimmed };
}

/** Formats quantity + name to line (GP vs Nx Name). */
export function formatEquipmentLine(quantity: number, name: string): string {
  if (name.toUpperCase() === 'GP') {
    return `${quantity} GP`;
  }
  return quantity > 1 ? `${quantity}x ${name}` : name;
}

/** Converts option text to normalized equipment lines (for rebuild). */
export function optionTextToLines(optionText: string): string[] {
  const items = parseStartingEquipmentOptionItems(optionText);
  return items.map(({ quantity, name }) => formatEquipmentLine(quantity, name));
}

/**
 * Normalize Starting Equipment option text for comparisons across derives
 * (avoids wiping choices on whitespace-only or capitalization churn from ingest).
 */
export function normalizeStartingEquipmentOptionTextForCompare(text: string | undefined): string {
  return String(text ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

export function areStartingEquipmentParsedOptionsEquivalent(
  a: readonly { label: string; text: string }[],
  b: readonly { label: string; text: string }[]
): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const al = String(a[i]?.label ?? '').trim().toUpperCase();
    const bl = String(b[i]?.label ?? '').trim().toUpperCase();
    if (al !== bl) return false;
    const at = normalizeStartingEquipmentOptionTextForCompare(a[i]?.text ?? '');
    const bt = normalizeStartingEquipmentOptionTextForCompare(b[i]?.text ?? '');
    if (at !== bt) return false;
  }
  return true;
}

/**
 * Splits equipment string into lines attributed to class option, background option, or manual.
 * Consumes class budget first, then background, remainder is manual.
 * Also returns original line indices for manual lines (for remove/change quantity).
 */
export function splitEquipmentBySource(
  equipment: string,
  classOptionText: string | null,
  backgroundOptionText: string | null
): { classLines: string[]; backgroundLines: string[]; manualLines: string[]; manualIndices: number[] } {
  const lines = (equipment ?? '')
    .split(/\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  const classBudget = new Map<string, number>();
  if (classOptionText) {
    for (const { quantity, name } of parseStartingEquipmentOptionItems(classOptionText)) {
      classBudget.set(name, (classBudget.get(name) ?? 0) + quantity);
    }
  }
  const backgroundBudget = new Map<string, number>();
  if (backgroundOptionText) {
    for (const { quantity, name } of parseStartingEquipmentOptionItems(backgroundOptionText)) {
      backgroundBudget.set(name, (backgroundBudget.get(name) ?? 0) + quantity);
    }
  }
  const classLines: string[] = [];
  const backgroundLines: string[] = [];
  const manualLines: string[] = [];
  const manualIndices: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const { quantity, name } = parseEquipmentLine(line);
    const deduct = (budget: Map<string, number>) => {
      const b = budget.get(name) ?? 0;
      if (b >= quantity) {
        budget.set(name, b - quantity);
        return true;
      }
      return false;
    };
    if (classBudget.size > 0 && deduct(classBudget)) {
      classLines.push(line);
    } else if (backgroundBudget.size > 0 && deduct(backgroundBudget)) {
      backgroundLines.push(line);
    } else {
      manualLines.push(line);
      manualIndices.push(i);
    }
  }
  return { classLines, backgroundLines, manualLines, manualIndices };
}

/** Returns equipment string with lines belonging to sourceOptionText removed. */
export function getEquipmentWithoutSource(
  equipment: string,
  sourceOptionText: string | null
): string {
  if (!sourceOptionText?.trim()) return equipment ?? '';
  const budget = new Map<string, number>();
  for (const { quantity, name } of parseStartingEquipmentOptionItems(sourceOptionText)) {
    budget.set(name, (budget.get(name) ?? 0) + quantity);
  }
  const lines = (equipment ?? '')
    .split(/\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  const remaining: string[] = [];
  for (const line of lines) {
    const { quantity, name } = parseEquipmentLine(line);
    const b = budget.get(name) ?? 0;
    if (b >= quantity) {
      budget.set(name, b - quantity);
    } else {
      remaining.push(line);
    }
  }
  return remaining.join('\n');
}

export function isEquipmentLineGP(line: string): boolean {
  return parseEquipmentLine(line).name.toUpperCase() === 'GP';
}

/**
 * Parses item cost from Open5e/rule-item raw data to GP.
 * Supports: cost "15 gp", cost { quantity, unit }, cost_quantity/cost_unit.
 */
export function getItemCostGP(raw: Record<string, unknown> | null | undefined): number | null {
  if (!raw) return null;
  const cost = raw.cost ?? (raw as Record<string, unknown>).cost;
  if (typeof cost === 'string') {
    // Open5e v2 stores costs pre-normalized to GP as decimals (e.g. "0.02" = 2 CP, "0.20" = 2 SP)
    const m = cost.trim().match(/^(\d+(?:\.\d+)?)\s*(gp|gold|gold pieces?)?$/i);
    if (m) return parseFloat(m[1]);
    const m2 = cost.trim().match(/^(\d+)\s*(sp|silver)/i);
    if (m2) return parseInt(m2[1], 10) / 10;
    const m3 = cost.trim().match(/^(\d+)\s*(cp|copper)/i);
    if (m3) return parseInt(m3[1], 10) / 100;
    return null;
  }
  if (cost && typeof cost === 'object') {
    const obj = cost as { quantity?: number; unit?: string };
    const q = obj.quantity ?? (raw as Record<string, unknown>).cost_quantity;
    const unit = String((obj.unit ?? (raw as Record<string, unknown>).cost_unit ?? 'gp')).toLowerCase();
    if (q == null || typeof q !== 'number') return null;
    if (unit.includes('gp') || unit === 'gold') return q;
    if (unit.includes('sp') || unit === 'silver') return q / 10;
    if (unit.includes('cp') || unit === 'copper') return q / 100;
    return q;
  }
  const q = (raw as Record<string, unknown>).cost_quantity;
  if (typeof q === 'number') return q;
  return null;
}

/**
 * Breaks a decimal GP value into whole coin denominations.
 * 14.9 → { gp: 14, sp: 9, cp: 0 }
 */
export function breakdownGP(gp: number): { gp: number; sp: number; cp: number } {
  const totalCP = Math.round(Math.max(0, gp) * 100);
  return {
    gp: Math.floor(totalCP / 100),
    sp: Math.floor((totalCP % 100) / 10),
    cp: totalCP % 10,
  };
}

/** Max whole coins per denomination (GP / SP / CP) in wallet UI and persisted form state. */
export const WALLET_COIN_MAX = 999;

/** Whole coins for wallet fields; `''` / NaN / non-finite → 0 (avoids empty controlled inputs). */
export function coerceNonNegativeWalletInt(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === 'number' && Number.isFinite(v)) return Math.max(0, Math.trunc(v));
  if (typeof v === 'string') {
    const t = v.trim().replace(/\D/g, '');
    if (t === '') return 0;
    const n = parseInt(t, 10);
    return Number.isFinite(n) ? Math.max(0, n) : 0;
  }
  return 0;
}

export type CoinType = 'gp' | 'sp' | 'cp';

/**
 * Returns the display text and coin type for a GP decimal value.
 * 2.00 → { text: "2 GP", currency: "gp" }
 * 0.20 → { text: "2 SP", currency: "sp" }
 * 0.02 → { text: "2 CP", currency: "cp" }
 */
export function formatCostInfo(gp: number): { text: string; currency: CoinType } {
  if (gp <= 0) return { text: 'Free', currency: 'gp' };
  if (gp >= 1) return { text: `${Math.round(gp)} GP`, currency: 'gp' };
  const asSP = gp * 10;
  if (Math.abs(asSP - Math.round(asSP)) < 0.001) {
    return { text: `${Math.round(asSP)} SP`, currency: 'sp' };
  }
  const asCP = Math.round(gp * 100);
  return { text: asCP > 0 ? `${asCP} CP` : 'Free', currency: 'cp' };
}

export function formatCostDisplay(gp: number): string {
  return formatCostInfo(gp).text;
}

/**
 * Deducts GP from equipment string. Reduces the last GP line(s) by amount.
 * Returns the new equipment string. If total GP < amount, deducts all GP (result may be 0).
 */
export function deductGPFromEquipment(
  equipment: string | null | undefined,
  amount: number
): string {
  if (!amount) return equipment ?? '';
  const lines = (equipment ?? '')
    .split(/\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  let toDeduct = amount;
  const gpIndices: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (isEquipmentLineGP(lines[i])) gpIndices.push(i);
  }
  for (let k = gpIndices.length - 1; k >= 0 && toDeduct > 0; k--) {
    const idx = gpIndices[k];
    const { quantity, name } = parseEquipmentLine(lines[idx]);
    const deduct = Math.min(toDeduct, quantity);
    toDeduct -= deduct;
    const newQty = quantity - deduct;
    if (newQty <= 0) {
      lines[idx] = '';
    } else {
      lines[idx] = formatEquipmentLine(newQty, name);
    }
  }
  return lines.filter((l) => l.length > 0).join('\n');
}

/** Returns total quantity of an item in equipment (all sources). Case-insensitive name match. */
export function getEquipmentItemQuantity(
  equipment: string | null | undefined,
  itemName: string
): number {
  if (!equipment?.trim() || !itemName?.trim()) return 0;
  const nameLower = itemName.trim().toLowerCase();
  return equipment
    .split(/\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .reduce((sum, line) => {
      const { quantity, name } = parseEquipmentLine(line);
      return name.toLowerCase() === nameLower ? sum + quantity : sum;
    }, 0);
}

/** Sums all GP from an equipment string (base GP das fontes). */
export function getTotalGP(equipment: string | null | undefined): number {
  if (!equipment?.trim()) return 0;
  return equipment
    .split(/\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .reduce((sum, line) => {
      const { quantity, name } = parseEquipmentLine(line);
      return name.toUpperCase() === 'GP' ? sum + quantity : sum;
    }, 0);
}

/**
 * GP disponível = base (linhas) - gasto em compras.
 * As linhas de GP (Class, Background, etc.) não mudam; só o total reflete compras/vendas.
 */
export function getAvailableGP(
  equipment: string | null | undefined,
  equipmentSpentGP: number = 0
): number {
  return Math.max(0, getTotalGP(equipment) - equipmentSpentGP);
}

/** Same as available GP but not clamped to zero (sheet view manual GP edits). */
export function getAvailableGpUnclamped(
  equipment: string | null | undefined,
  equipmentSpentGP: number = 0
): number {
  return getTotalGP(equipment) - equipmentSpentGP;
}

/** Fold smart quotes / apostrophe-like chars so sheet text matches DB names consistently. */
function normalizeEquipmentUnicodePunctuation(name: string): string {
  return String(name)
    .replace(/[\u2018\u2019\u201A\u201B\u2032\u2035\u0060\u00B4]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F\u2033\u2036]/g, '"');
}

/** Normalized key for matching sheet lines to catalog item names (handles punctuation variants). */
export function normalizeEquipmentLookupKey(name: string): string {
  return normalizeEquipmentUnicodePunctuation(name)
    .trim()
    .toLowerCase()
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9\s'-]/g, '')
    .trim();
}

/**
 * Alternate phrasings for the same item (e.g. "Traveler's Clothes" vs "Clothes, Traveler's").
 */
export function canonicalEquipmentLookupKeys(phrase: string): string[] {
  const keys = new Set<string>();
  const norm = normalizeEquipmentLookupKey(phrase);
  if (norm) {
    keys.add(norm);
    // Also register singular/plural so "Arrow" resolves to "Arrows (20)" and vice-versa.
    if (norm.length > 2 && norm.endsWith('s')) keys.add(norm.slice(0, -1));
    else if (norm.length > 1) keys.add(norm + 's');
  }
  const t = normalizeEquipmentUnicodePunctuation(String(phrase)).trim();
  if (!t) return [...keys];

  // "Name (Variant)" → also try "Name Variant" and "Name, Variant" so that
  // e.g. "Arcane Focus (crystal)" resolves to "Arcane Focus, Crystal".
  const parenMatch = t.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  if (parenMatch) {
    const base = parenMatch[1].trim();
    const variant = parenMatch[2].trim();
    keys.add(normalizeEquipmentLookupKey(`${base} ${variant}`));
    keys.add(normalizeEquipmentLookupKey(`${base}, ${variant}`));
    // "Quarterstaff" is a staff — also generate aliases for the staff variant names
    // so that e.g. "Arcane Focus (Quarterstaff)" resolves to "Arcane Focus, Staff"
    // and "Druidic Focus (Quarterstaff)" resolves to "Druidic Focus, Wooden Staff".
    if (variant.toLowerCase() === 'quarterstaff') {
      keys.add(normalizeEquipmentLookupKey(`${base} Staff`));
      keys.add(normalizeEquipmentLookupKey(`${base}, Staff`));
      keys.add(normalizeEquipmentLookupKey(`${base} Wooden Staff`));
      keys.add(normalizeEquipmentLookupKey(`${base}, Wooden Staff`));
    }
  }

  const commaIdx = t.indexOf(',');
  if (commaIdx > 0) {
    const left = t.slice(0, commaIdx).trim();
    const right = t.slice(commaIdx + 1).trim();
    keys.add(normalizeEquipmentLookupKey(`${right} ${left}`));
    keys.add(normalizeEquipmentLookupKey(`${right}, ${left}`));
  }

  const parts = t.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const last = parts[parts.length - 1]!;
    const rest = parts.slice(0, -1).join(' ');
    keys.add(normalizeEquipmentLookupKey(`${last}, ${rest}`));
  }
  return [...keys].filter(Boolean);
}

/** Maps normalized keys → rule item id (first wins). Register every alias for each catalog name. */
export function buildEquipmentItemIdLookupMap(items: { id: string; name: string }[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const it of items) {
    for (const k of canonicalEquipmentLookupKeys(it.name)) {
      if (k && !m.has(k)) m.set(k, it.id);
    }
  }
  return m;
}

/**
 * Items that appear in starting equipment text but don't exist by that name in the DB.
 * Maps normalized display name → canonical DB item name.
 */
const EQUIPMENT_NAME_ALIASES: Record<string, string> = {
  spellbook: 'book',
};

/** Resolves a line display name to a rule item id, or null if not in catalog. */
export function resolveEquipmentItemId(lineName: string, lookup: Map<string, string>): string | null {
  for (const k of canonicalEquipmentLookupKeys(lineName)) {
    const id = lookup.get(k);
    if (id) return id;
  }
  const stripped = String(lineName).replace(/\s+of\s+your\s+choice\s*$/i, '').trim();
  if (stripped !== lineName) {
    for (const k of canonicalEquipmentLookupKeys(stripped)) {
      const id = lookup.get(k);
      if (id) return id;
    }
  }
  const alias = EQUIPMENT_NAME_ALIASES[normalizeEquipmentLookupKey(lineName)];
  if (alias) {
    for (const k of canonicalEquipmentLookupKeys(alias)) {
      const id = lookup.get(k);
      if (id) return id;
    }
  }
  return null;
}

/**
 * Resolves equipment placeholder lines that reference tool proficiency choices:
 *   "Artisan's Tools or Musical Instrument chosen for the tool proficiency above"
 *   "Gaming Set (same as above)"
 *
 * Returns the actual chosen item name from toolProficiencyChoices,
 * null if the placeholder matched but no choice was made (skip the line),
 * or the original line unchanged if it's not a recognised placeholder.
 */
export function resolveEquipmentToolPlaceholder(
  line: string,
  toolProficiencyChoices: Record<string, string[]>
): string | null | typeof line {
  const norm = line.trim().toLowerCase();

  let targetTags: string[] | null = null;

  if (
    (norm.includes('artisan') || norm.includes('musical instrument')) &&
    (norm.includes('proficiency') || norm.includes('chosen for'))
  ) {
    targetTags = ['item:category:artisan', 'item:category:musical-instrument'];
  } else if (norm.includes('gaming set') && norm.includes('same as above')) {
    targetTags = ['item:category:gaming-set'];
  }

  if (!targetTags) return line; // Not a placeholder — return unchanged.

  for (const [key, chosen] of Object.entries(toolProficiencyChoices)) {
    const parsed = parseToolChoiceCategoryTags(key);
    if (parsed && parsed.some((t) => targetTags!.includes(t))) {
      return chosen[0] ?? null;
    }
  }
  return null; // Placeholder matched but no choice made yet.
}

/** Minimal extraction of item:category:* tags from a "Choose N X or Y" proficiency key. */
function parseToolChoiceCategoryTags(key: string): string[] | null {
  const m = key.match(/^Choose\s+(?:\d+|one)\s+(?:(?:kind|type)\s+of\s+)?(.+)$/i);
  if (!m) return null;
  const SLUG_MAP: Record<string, string> = {
    'musical instruments': 'musical-instrument',
    'musical instrument': 'musical-instrument',
    'gaming set': 'gaming-set',
    'gaming sets': 'gaming-set',
    "artisan's tools": 'artisan',
    'artisans tools': 'artisan',
    'artisan tools': 'artisan',
  };
  return m[1]
    .split(/\s+or\s+/i)
    .map((p) => {
      const n = p.trim().toLowerCase().replace(/[''']/g, "'").replace(/\s+/g, ' ');
      const slug = SLUG_MAP[n] ?? n.replace(/\s+/g, '-').replace(/'/g, '');
      return `item:category:${slug}`;
    });
}
