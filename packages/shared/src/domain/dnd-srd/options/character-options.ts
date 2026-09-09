/**
 * Turns a rule item's `normalized` data into the menus of choices a character must make, and
 * resolves an equipment bundle's text into concrete items plus gold.
 *
 * Consumed by BOTH the web editor derivation and the backend AI generation, so the options the AI
 * picks from are exactly the ones the editor will show.
 */
import { escapeRegExp } from '../util/text-utils';

/** Canonical D&D ability names, in sheet order. */
export const DND_ABILITY_NAMES = [
  'Strength',
  'Dexterity',
  'Constitution',
  'Intelligence',
  'Wisdom',
  'Charisma',
] as const;

/** Canonical SRD 5.2 damage types (fixed rules text; not stored as rule items). */
export const DND_DAMAGE_TYPES = [
  'Acid',
  'Bludgeoning',
  'Cold',
  'Fire',
  'Force',
  'Lightning',
  'Necrotic',
  'Piercing',
  'Poison',
  'Psychic',
  'Radiant',
  'Slashing',
  'Thunder',
] as const;

/** In SRD 5.2 every class picks its subclass at level 3. */
export const SUBCLASS_UNLOCK_LEVEL = 3;

/** Class sourceKey a SUBCLASS rule item belongs to (`normalized.subclassOf.key`), or null. */
export function extractSubclassOfKey(
  normalized: Record<string, unknown> | undefined | null
): string | null {
  const subclassOf = (normalized as { subclassOf?: { key?: unknown } } | undefined | null)
    ?.subclassOf;
  return typeof subclassOf?.key === 'string' && subclassOf.key.trim() ? subclassOf.key : null;
}

// --- Skill parsing ---

export function skillNameToKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, '-');
}

/**
 * Extracts from a Skill Proficiencies string (e.g. "Choose 2: Athletics, Insight, or Religion")
 * the list of skill keys and how many to choose (chooseN).
 * "Choose any N skills" -> keys = [] and chooseN = N (any skill).
 */
export function parseSkillProficienciesText(text: string | undefined): {
  keys: string[];
  chooseN: number | null;
} {
  if (!text || typeof text !== 'string') return { keys: [], chooseN: null };
  const anyMatch = text.match(/choose\s+any\s+(\d+)\s+skills?/i);
  if (anyMatch) {
    return { keys: [], chooseN: parseInt(anyMatch[1], 10) };
  }
  const chooseMatch = text.match(/choose\s+(\d+)/i);
  const chooseN = chooseMatch ? parseInt(chooseMatch[1], 10) : null;
  const afterColon = text.includes(':') ? text.split(':').slice(1).join(':').trim() : text;
  const rawNames = afterColon
    .split(/\s*,\s*|\s+or\s+|\s+and\s+/i)
    .map((s) =>
      s
        .trim()
        .replace(/^(or|and)\s+/i, '')
        .trim()
    )
    .filter(Boolean);
  const keys = rawNames.map(skillNameToKey).filter(Boolean);
  return { keys, chooseN };
}

// --- Ability parsing ---

export function parseAllowedAbilityNamesFromDesc(desc: string): string[] {
  if (!desc || typeof desc !== 'string') return [];
  const parts = desc
    .split(/\s*,\s*|\s+and\s+/i)
    .map((s) => s.trim())
    .filter(Boolean);
  const allowed: string[] = [];
  const canonicalLower = new Map(DND_ABILITY_NAMES.map((a) => [a.toLowerCase(), a as string]));
  for (const part of parts) {
    const canonical = canonicalLower.get(part.toLowerCase());
    if (canonical && !allowed.includes(canonical)) allowed.push(canonical);
  }
  return allowed;
}

// --- Table (|Label|Value|) parsing ---

/**
 * Extracts label/value pairs from a markdown-table-like block (|Label|Value|),
 * used to read Skill/Weapon/Armor proficiencies and Starting Equipment from a
 * class's "core traits" feature text.
 */
export function parseTableLikeToMap(text: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!text?.trim()) return out;
  const lines = text
    .replace(/^\s*\|\|\|?\s*\n?/, '')
    .trim()
    .split(/\n/);
  for (const line of lines) {
    if (!line.includes('|')) continue;
    const cells = line
      .split('|')
      .map((c) => c.trim())
      .filter(Boolean);
    if (cells.length < 2) continue;
    if (cells.every((c) => /^-+$/.test(c))) continue;
    const label = cells[0];
    const value = cells.slice(1).join(' — ').trim();
    if (label && value) out[label] = value;
  }
  return out;
}

// --- Starting-equipment bundle parsing ---

export interface EquipmentBundleOption {
  label: string;
  text: string;
}

/**
 * Extracts Starting Equipment options in the formats:
 * - "Choose A or B: (A) ...; or (B) ..."
 * - "*Choose A or B:* (A) ...; or (B) ..." (leading markdown)
 * - "Choose A, B, or C: (A) ...; (B) ...; or (C) ..."
 * Returns [{ label: 'A', text: '...' }, ...].
 */
export function parseStartingEquipmentOptions(text: string | undefined): EquipmentBundleOption[] {
  if (!text || typeof text !== 'string') return [];
  let trimmed = text.trim();
  trimmed = trimmed
    .replace(/^\s*\*+/, '')
    .replace(/\*+\s*$/, '')
    .trim();
  const afterColon = trimmed.includes(':') ? trimmed.split(':').slice(1).join(':').trim() : trimmed;
  const afterColonClean = afterColon.replace(/^\s*\*+/, '').trim();
  if (!afterColonClean) return [];
  const parts = afterColonClean
    .split(/\s*;\s*/)
    .map((p) =>
      p
        .replace(/^\s*or\s+/i, '')
        .replace(/^\s*\*+/, '')
        .trim()
    )
    .filter(Boolean);
  const options: EquipmentBundleOption[] = [];
  for (const part of parts) {
    const match = part.match(/^\s*\(([A-Za-z])\)\s*([\s\S]+)$/);
    if (match) {
      options.push({ label: match[1].toUpperCase(), text: match[2].trim() });
    }
  }
  return options;
}

// --- Equipment line / bundle → items primitives ---

function parseStartingEquipmentSegments(optionText: string): string[] {
  return optionText
    .split(/\s*,\s*/)
    .map((s) => s.replace(/^\s*and\s+/i, '').trim())
    .filter(Boolean);
}

/**
 * Singularizes an item name when qty > 1, matching how plurals appear in option texts.
 *
 * The "ends with s" guard protects compound names ("Bullets, Sling"), where the plural is in the
 * first segment and blind singularizing would produce "Arcane Focu". Keeping the compound intact is
 * what keeps the name resolvable back to the catalog id, so do NOT add comma handling here.
 */
export function singularizeIfPlural(name: string, qty: number): string {
  if (qty <= 1 || !name.endsWith('s') || /(?:^|\s)GP$/i.test(name)) return name;
  // Possessive, not plural ("Clothes, Traveler's"): cutting the s would mangle the name.
  if (name.endsWith("'s")) return name;
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
  const bundleMatch = trimmed.match(/^(.*?)\s*\((\d+)\s+(?!gp\b)\w+\)\s*$/i);
  if (bundleMatch) {
    const qty = Math.max(1, parseInt(bundleMatch[2], 10));
    return { quantity: qty, name: bundleMatch[1].trim() };
  }
  return { quantity: 1, name: trimmed };
}

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

export function isEquipmentLineGP(line: string): boolean {
  return parseEquipmentLine(line).name.toUpperCase() === 'GP';
}

/**
 * Resolves a single starting-equipment bundle's text into concrete items + gold.
 * GP segments accumulate into `gold`; everything else becomes an item entry.
 */
export function resolveEquipmentBundle(bundleText: string): {
  items: { name: string; quantity: number }[];
  gold: number;
} {
  const items: { name: string; quantity: number }[] = [];
  let gold = 0;
  for (const { quantity, name } of parseStartingEquipmentOptionItems(bundleText)) {
    if (name.trim().toUpperCase() === 'GP') {
      gold += quantity;
      continue;
    }
    items.push({ name, quantity: Math.max(1, quantity) });
  }
  return { items, gold };
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
    const al = String(a[i]?.label ?? '')
      .trim()
      .toUpperCase();
    const bl = String(b[i]?.label ?? '')
      .trim()
      .toUpperCase();
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
  backgroundOptionText: string | null,
  /**
   * Recorded source per line, when known. Wins over the text matching below, which cannot attribute a
   * resolved placeholder, a merged gold line, or an item both bundles grant.
   */
  knownSourceByLine?: ReadonlyArray<'class' | 'background' | 'manual'> | null
): {
  classLines: string[];
  backgroundLines: string[];
  manualLines: string[];
  /** Line index of each bucket entry in the equipment string; the sheet needs it to edit that row. */
  classIndices: number[];
  backgroundIndices: number[];
  manualIndices: number[];
} {
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
  const classIndices: number[] = [];
  const backgroundIndices: number[] = [];
  const manualIndices: number[] = [];

  // Only trusted when it describes THIS text: a stale map (an edit landed between) would mislabel
  // every line after the change, which is worse than re-inferring.
  if (knownSourceByLine && knownSourceByLine.length === lines.length) {
    for (let i = 0; i < lines.length; i++) {
      const bucket = knownSourceByLine[i];
      if (bucket === 'class') {
        classLines.push(lines[i]);
        classIndices.push(i);
      } else if (bucket === 'background') {
        backgroundLines.push(lines[i]);
        backgroundIndices.push(i);
      } else {
        manualLines.push(lines[i]);
        manualIndices.push(i);
      }
    }
    return {
      classLines,
      backgroundLines,
      manualLines,
      classIndices,
      backgroundIndices,
      manualIndices,
    };
  }

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
      classIndices.push(i);
    } else if (backgroundBudget.size > 0 && deduct(backgroundBudget)) {
      backgroundLines.push(line);
      backgroundIndices.push(i);
    } else {
      manualLines.push(line);
      manualIndices.push(i);
    }
  }
  return {
    classLines,
    backgroundLines,
    manualLines,
    classIndices,
    backgroundIndices,
    manualIndices,
  };
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

// --- High-level extractors (backend RAG → AI choice menus) ---

interface NormalizedFeature {
  key?: string;
  desc?: string;
}

export interface ClassChoiceOptions {
  /** Class skill choice: allowed keys + how many to pick (chooseN). */
  skillOptions: { keys: string[]; chooseN: number | null };
  /** Class starting-equipment bundles (Option A/B/...). */
  startingEquipment: EquipmentBundleOption[];
}

/**
 * Reads the class's skill-choice menu and starting-equipment bundles from its `normalized` data,
 * mirroring the web derivation exactly (core-traits table first, then flat `skillProficiencies`
 * / `startingEquipment` fields).
 */
export function extractClassChoiceOptions(
  normalized: unknown,
  sourceKey: string | null | undefined
): ClassChoiceOptions {
  const empty: ClassChoiceOptions = {
    skillOptions: { keys: [], chooseN: null },
    startingEquipment: [],
  };
  if (!normalized || typeof normalized !== 'object') return empty;
  const norm = normalized as Record<string, unknown>;

  const features = norm.features as NormalizedFeature[] | undefined;
  const coreKey = `${(sourceKey ?? '').trim()}_core-traits`;
  const core = Array.isArray(features)
    ? (features.find((f) => f.key === coreKey) ??
      features.find((f) => (f.key ?? '').endsWith('_core-traits')))
    : undefined;
  const coreMap = parseTableLikeToMap(
    core && typeof core.desc === 'string' ? core.desc : undefined
  );

  let skillOptions: { keys: string[]; chooseN: number | null } = { keys: [], chooseN: null };
  if (coreMap['Skill Proficiencies']) {
    skillOptions = parseSkillProficienciesText(coreMap['Skill Proficiencies']);
  } else {
    const sp = (norm.skillProficiencies ?? norm.skill_proficiencies) as string | undefined;
    if (sp) skillOptions = parseSkillProficienciesText(sp);
  }

  const startingEquipmentRaw =
    coreMap['Starting Equipment'] ??
    coreMap['Starting equipment'] ??
    norm.startingEquipment ??
    norm.starting_equipment;
  const startingEquipmentStr =
    typeof startingEquipmentRaw === 'string'
      ? startingEquipmentRaw
      : typeof startingEquipmentRaw === 'object' &&
          startingEquipmentRaw !== null &&
          'desc' in startingEquipmentRaw
        ? String((startingEquipmentRaw as { desc?: string }).desc ?? '')
        : '';

  return { skillOptions, startingEquipment: parseStartingEquipmentOptions(startingEquipmentStr) };
}

// --- Class spellcasting limits (cap the AI's spell picks to what the class+level allows) ---

function parseLeadingInt(val: unknown): number {
  const s = String(val ?? '').replace(/[^0-9]/g, '');
  return s ? parseInt(s, 10) : 0;
}

interface ClassTableFeature {
  key?: string;
  dataForClassTable?: Array<{
    level?: number | string;
    columnValue?: string;
    column_value?: string;
  }>;
  data_for_class_table?: Array<{
    level?: number | string;
    columnValue?: string;
    column_value?: string;
  }>;
}

/** Reads a class-table column's integer value at (or just below) the character's level. */
function columnValueAtLevel(feature: ClassTableFeature | undefined, level: number): number {
  const rows = feature?.dataForClassTable ?? feature?.data_for_class_table ?? [];
  let bestLevel = -1;
  let bestValue = '';
  for (const r of rows) {
    const lvl = Number(r.level);
    if (!Number.isFinite(lvl) || lvl > level || lvl <= bestLevel) continue;
    bestLevel = lvl;
    bestValue = String(r.columnValue ?? r.column_value ?? '');
  }
  return bestLevel >= 0 ? parseLeadingInt(bestValue) : 0;
}

export interface ClassSpellLimits {
  isSpellcaster: boolean;
  /** Cantrips known at this level. */
  maxCantrips: number;
  /** Leveled spells the class prepares or knows at this level. */
  maxLeveledSpells: number;
  /** Highest spell level the class can cast at this level (0 = none). */
  maxSpellLevel: number;
}

const SLOT_SUFFIXES = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th'] as const;

/** Extracts the class's spellcasting limits at `level` from its `normalized` class-table columns. */
export function extractClassSpellLimits(
  normalized: unknown,
  sourceKey: string | null | undefined,
  level: number
): ClassSpellLimits {
  const empty: ClassSpellLimits = {
    isSpellcaster: false,
    maxCantrips: 0,
    maxLeveledSpells: 0,
    maxSpellLevel: 0,
  };
  if (!normalized || typeof normalized !== 'object') return empty;
  const features = (normalized as Record<string, unknown>).features as
    | ClassTableFeature[]
    | undefined;
  if (!Array.isArray(features)) return empty;

  const base = (sourceKey ?? '').trim();
  const byKey = (suffix: string) =>
    features.find((f) => String(f.key ?? '') === `${base}_${suffix}`);
  const lv = Math.max(1, Math.min(20, Math.trunc(level) || 1));

  const maxCantrips = columnValueAtLevel(byKey('cantrips'), lv);
  const maxLeveledSpells = columnValueAtLevel(
    byKey('prepared-spells') ??
      byKey('prepared_spells') ??
      byKey('spells-known') ??
      byKey('spells_known'),
    lv
  );

  let maxSpellLevel = 0;
  SLOT_SUFFIXES.forEach((suffix, i) => {
    if (columnValueAtLevel(byKey(`slots-${suffix}`), lv) > 0) maxSpellLevel = i + 1;
  });
  if (maxSpellLevel === 0) {
    // Warlock Pact Magic exposes a single "Slot Level" column instead of per-level slot columns.
    maxSpellLevel = columnValueAtLevel(byKey('slot-level') ?? byKey('slot_level'), lv);
  }

  return {
    isSpellcaster: maxCantrips > 0 || maxLeveledSpells > 0 || maxSpellLevel > 0,
    maxCantrips,
    maxLeveledSpells,
    maxSpellLevel,
  };
}

// --- Single-choice class-feature options (Fighting Style, Divine Order, …) ---

export interface FeatureTraitOption {
  key: string;
  label: string;
}

/** Options from a markdown-table trait (first column of each data row). */
function parseTableTraitOptions(desc: string): FeatureTraitOption[] {
  const lines = desc.split('\n');
  const options: FeatureTraitOption[] = [];
  let tableStarted = false;
  let headerSkipped = false;
  let separatorSkipped = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|')) {
      if (tableStarted && options.length > 0) break;
      tableStarted = false;
      headerSkipped = false;
      separatorSkipped = false;
      continue;
    }
    tableStarted = true;
    if (!headerSkipped) {
      headerSkipped = true;
      continue;
    }
    const cells = trimmed
      .split('|')
      .map((c) => c.trim())
      .filter(Boolean);
    if (!separatorSkipped) {
      if (cells.every((c) => /^:?-+:?$/.test(c))) {
        separatorSkipped = true;
        continue;
      }
      separatorSkipped = true;
    }
    if (cells.length > 0) {
      const label = cells[0];
      if (label && !/^:?-+:?$/.test(label)) {
        options.push({ key: label.toLowerCase().replace(/\s+/g, '-'), label });
      }
    }
  }
  return options;
}

/** Options from a paragraph/bulleted trait (bold or "Name. Description" headings). */
function parseParagraphTraitOptions(desc: string): FeatureTraitOption[] {
  const bulletOptions: FeatureTraitOption[] = [];
  for (const m of desc.matchAll(/^[ \t]*[-*][ \t]+\*\*([^*]+)\*\*/gm)) {
    const label = m[1].replace(/\.\s*$/, '').trim();
    if (label.length >= 2 && label.length <= 70) {
      bulletOptions.push({ key: label.toLowerCase().replace(/['\s]+/g, '-'), label });
    }
  }
  if (bulletOptions.length >= 2) return bulletOptions;

  const INTRO_PREFIXES = [
    'you are',
    'you have',
    'you gain',
    'choose',
    'your ',
    'when ',
    'once ',
    'this ',
    'as a ',
    'at level',
    'the following',
    'intelligence',
    'each of',
    'in addition',
    'starting at',
    'whichever',
  ];
  const paragraphs = desc.split(/\n\n+/);
  const options: FeatureTraitOption[] = [];

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;
    const lower = trimmed.toLowerCase();
    if (INTRO_PREFIXES.some((p) => lower.startsWith(p))) continue;
    if (lower.includes('one of the following options')) continue;

    const boldMatch = trimmed.match(/^\s*\*\*([^*]+)\*\*/);
    if (boldMatch) {
      const label = boldMatch[1].replace(/\.\s*$/, '').trim();
      if (label.length >= 2 && label.length <= 70) {
        options.push({ key: label.toLowerCase().replace(/['\s]+/g, '-'), label });
      }
      continue;
    }

    const plainMatch = trimmed.match(
      /^([A-Z][A-Za-z'\-\s]{1,55}?)(?:\s*\([^)]{1,50}\))?\.\s+[A-Z]/
    );
    if (plainMatch) {
      const label = plainMatch[1].trim();
      if (label.length >= 2 && label.length <= 60 && label.split(' ').length <= 8) {
        options.push({ key: label.toLowerCase().replace(/['\s]+/g, '-'), label });
      }
    }
  }
  return options;
}

/** Selectable sub-options of a trait/feature (table first, else paragraphs). */
export function parseTraitOptions(desc: string): FeatureTraitOption[] {
  const tableOpts = parseTableTraitOptions(desc);
  if (tableOpts.length >= 2) return tableOpts;
  return parseParagraphTraitOptions(desc);
}

/** Class features that are a single "choose one" option (each keyed by its display name). */
const SINGLE_CHOICE_CLASS_FEATURE_NAMES = new Set([
  'fighting style',
  'divine order',
  'primal order',
  'blessed strikes',
  'elemental fury',
]);

interface NormalizedClassFeature {
  name?: string;
  desc?: string;
  featureType?: string;
  feature_type?: string;
  gainedAt?: unknown;
  gained_at?: unknown;
}

function minGainLevel(feature: NormalizedClassFeature): number {
  const raw = feature.gainedAt ?? feature.gained_at;
  if (!Array.isArray(raw)) return 1;
  const levels: number[] = [];
  for (const x of raw) {
    if (typeof x === 'number') levels.push(x);
    else if (x && typeof x === 'object' && 'level' in x)
      levels.push(Number((x as { level?: number }).level));
  }
  const valid = levels.filter((n) => Number.isFinite(n) && n > 0);
  return valid.length ? Math.min(...valid) : 1;
}

export interface ClassFeatureChoice {
  /** Feature display name (used as the featureChoices key). */
  feature: string;
  options: FeatureTraitOption[];
}

/**
 * Single-choice class features the character has by `level` (Fighting Style, Divine Order, …), each
 * with its parsed options — so the AI can pick one and the sheet loads without a pending choice.
 */
export function extractClassFeatureChoices(
  normalized: unknown,
  level: number
): ClassFeatureChoice[] {
  if (!normalized || typeof normalized !== 'object') return [];
  const features = (normalized as Record<string, unknown>).features as
    | NormalizedClassFeature[]
    | undefined;
  if (!Array.isArray(features)) return [];
  const lv = Math.max(1, Math.min(20, Math.trunc(level) || 1));

  const out: ClassFeatureChoice[] = [];
  const seen = new Set<string>();
  for (const f of features) {
    const name = (f.name ?? '').trim();
    const nameLower = name.toLowerCase();
    if (!SINGLE_CHOICE_CLASS_FEATURE_NAMES.has(nameLower) || seen.has(nameLower)) continue;
    if (minGainLevel(f) > lv) continue;
    const options = parseTraitOptions(typeof f.desc === 'string' ? f.desc : '');
    // Fighting Style can legitimately expose a single option (e.g. Paladin → Blessed Warrior).
    const minOptions = nameLower === 'fighting style' ? 1 : 2;
    if (options.length < minOptions) continue;
    seen.add(nameLower);
    out.push({ feature: name, options });
  }
  return out;
}

// --- Option-list features (Metamagic Options / Eldritch Invocation Options) ---

/**
 * ### headings and plain-title blocks before *Cost* / *Prerequisite* (CLASS_FEATURE_OPTION_LIST text).
 */
function collectOptionListBlocks(desc: string): Map<string, { label: string; block: string }> {
  if (!desc?.trim()) return new Map();
  const normalizeKey = (labelRaw: string) =>
    labelRaw
      .trim()
      .replace(/\s+/g, ' ')
      .toLowerCase()
      .replace(/[^\w\s-]/g, '');
  const byNorm = new Map<string, { label: string; block: string }>();

  for (const m of desc.matchAll(/(?:^|\n)###\s+([^\n#][^\n]*)\n([\s\S]*?)(?=\n###\s|$)/g)) {
    const rawLabel = (m[1] ?? '').trim();
    const block = (m[2] ?? '').trim();
    if (!rawLabel) continue;
    byNorm.set(normalizeKey(rawLabel), { label: rawLabel, block });
  }

  for (const m of desc.matchAll(
    /(?:^|\n)\s*([A-Z][A-Za-z'\-\s]{2,60})\s*\n\s*\n\s*(\*{1,2}(?:Cost|Prerequisite):[\s\S]*?)(?=\n###\s|\n\s*[A-Z][A-Za-z'\-\s]{2,60}\s*\n\s*\n\s*\*{1,2}(?:Cost|Prerequisite):|$)/g
  )) {
    const rawLabel = (m[1] ?? '').trim();
    const block = (m[2] ?? '').trim();
    const n = normalizeKey(rawLabel);
    if (!rawLabel || byNorm.has(n)) continue;
    byNorm.set(n, { label: rawLabel, block });
  }

  return byNorm;
}

function stripStarredFieldLine(line: string, field: 'Cost' | 'Prerequisite'): string | null {
  const t = line.trim();
  if (!new RegExp(`^\\*{1,2}\\s*${field}`, 'i').test(t)) return null;
  let s = t
    .replace(/^\*{1,2}\s*/, '')
    .replace(/\*+$/g, '')
    .trim();
  const reField = new RegExp(`^${field}:?\\s*`, 'i');
  s = s.replace(reField, '').trim();
  return s || null;
}

export interface OptionListEntry {
  key: string;
  label: string;
  desc?: string;
  cost?: string;
  prerequisite?: string;
}

/**
 * Extracts Metamagic option names from the "Metamagic Options" feature list text.
 * Supports markdown headings ("### Careful Spell") and plain blocks before "*Cost:" / "*Prerequisite:".
 */
export function parseMetamagicOptions(desc: string): OptionListEntry[] {
  if (!desc?.trim()) return [];
  const out: OptionListEntry[] = [];
  const seen = new Set<string>();

  const add = (labelRaw: string, blockRaw?: string) => {
    const label = labelRaw.trim().replace(/\s+/g, ' ');
    if (!label) return;
    const key = label.toLowerCase().replace(/['\s]+/g, '-');
    if (seen.has(key)) return;
    seen.add(key);
    const block = (blockRaw ?? '').trim();
    if (!block) {
      out.push({ key, label });
      return;
    }
    const lines = block.split('\n');
    const costLine = lines.find((l) => /^\*{1,2}\s*Cost/i.test(l.trim()));
    const cost = costLine ? (stripStarredFieldLine(costLine, 'Cost') ?? undefined) : undefined;
    const body = lines
      .filter((l) => l !== costLine)
      .join('\n')
      .trim();
    out.push({ key, label, desc: body || undefined, cost });
  };

  for (const { label, block } of collectOptionListBlocks(desc).values()) {
    add(label, block);
  }

  return out;
}

/**
 * Eldritch Invocation Options list: same block structure as Metamagic Options, often with *Prerequisite:*.
 */
export function parseEldritchInvocationOptions(desc: string): OptionListEntry[] {
  if (!desc?.trim()) return [];
  const out: OptionListEntry[] = [];
  const seen = new Set<string>();

  for (const { label: rawLabel, block: blockRaw } of collectOptionListBlocks(desc).values()) {
    const label = rawLabel.trim().replace(/\s+/g, ' ');
    if (!label) continue;
    const key = label.toLowerCase().replace(/['\s]+/g, '-');
    if (seen.has(key)) continue;
    seen.add(key);
    const block = blockRaw.trim();
    if (!block) {
      out.push({ key, label });
      continue;
    }
    const lines = block.split('\n');
    const isPrereqLine = (l: string) => /^\*{1,2}\s*Prerequisite/i.test(l.trim());
    const isCostLine = (l: string) => /^\*{1,2}\s*Cost/i.test(l.trim());
    const prereqLines = lines.filter(isPrereqLine);
    const costLines = lines.filter(isCostLine);
    const prereqParts = prereqLines
      .map((l) => stripStarredFieldLine(l, 'Prerequisite'))
      .filter((p): p is string => Boolean(p));
    const prerequisite = prereqParts.length > 0 ? prereqParts.join(' ') : undefined;
    const costParts = costLines
      .map((l) => stripStarredFieldLine(l, 'Cost'))
      .filter((p): p is string => Boolean(p));
    const cost = costParts.length > 0 ? costParts.join(' ') : undefined;
    const skip = new Set([...prereqLines, ...costLines]);
    const body = lines
      .filter((l) => !skip.has(l))
      .join('\n')
      .trim();
    out.push({ key, label, desc: body || undefined, cost, prerequisite });
  }

  return out;
}

// --- Feature gains (how many times a feature was gained by `level`) ---

export interface FeatureGainInfo {
  count: number;
  levels: number[];
  /** `gained_at[].detail` per gain, aligned with `levels` (e.g. Mystic Arcanum "level 6 spell"). */
  details: (string | undefined)[];
}

/** Gain levels+details ≤ `level`, merging `gained_at` with "at <class> level N, you gain <name>" re-gains. */
export function getFeatureGainInfo(
  feature: { name?: string; desc?: string; gainedAt?: unknown; gained_at?: unknown },
  level: number
): FeatureGainInfo {
  const raw = feature.gainedAt ?? feature.gained_at;
  const byLevel = new Map<number, string | undefined>();
  if (Array.isArray(raw)) {
    for (const x of raw) {
      if (typeof x === 'number' && x > 0) byLevel.set(x, undefined);
      else if (x && typeof x === 'object' && 'level' in x) {
        const lvl = Number((x as { level?: number }).level);
        if (Number.isFinite(lvl) && lvl > 0) {
          const detailRaw = (x as { detail?: unknown }).detail;
          byLevel.set(lvl, typeof detailRaw === 'string' ? detailRaw : undefined);
        }
      }
    }
  }
  // Recover "gained again" levels the structured data missed (e.g. Bard Expertise at 9).
  const name = (feature.name ?? '').trim();
  const desc = feature.desc ?? '';
  if (name.length >= 2 && desc) {
    const escaped = escapeRegExp(name);
    const re = new RegExp(
      `\\bat\\s+(?:[a-z]+\\s+)?level\\s+(\\d+)\\s*,?\\s+you\\s+gain\\s+${escaped}\\b`,
      'gi'
    );
    for (const m of desc.matchAll(re)) {
      const lvl = Number(m[1]);
      if (Number.isFinite(lvl) && lvl > 0 && !byLevel.has(lvl)) byLevel.set(lvl, undefined);
    }
  }
  const levels = [...byLevel.keys()].filter((l) => l <= level).sort((a, b) => a - b);
  // A feature with no structured gain data counts as gained once.
  if (levels.length === 0 && byLevel.size === 0) {
    return { count: 1, levels: [], details: [] };
  }
  return { count: levels.length, levels, details: levels.map((l) => byLevel.get(l)) };
}

// --- Advanced class + race choice menus (for the AI to fill every pending selection) ---

/** Class-table column value at `level`, matched by the feature's key or name against `nameRe`. */
function classTableValueByMatch(
  features: ClassTableFeature[] | undefined,
  nameRe: RegExp,
  level: number
): number {
  if (!Array.isArray(features)) return 0;
  for (const f of features) {
    const key = String((f as { key?: string }).key ?? '');
    const name = String((f as { name?: string }).name ?? '');
    if (!nameRe.test(key) && !nameRe.test(name)) continue;
    const v = columnValueAtLevel(f, level);
    if (v > 0) return v;
  }
  return 0;
}

export interface AdvancedClassChoices {
  /** Weapon Mastery: number of weapons to pick (0 = feature absent). */
  weaponMasteryCount: number;
  /** Expertise skill picks (2 per gain; 0 = feature absent). */
  expertiseCount: number;
  /** Barbarian Primal Knowledge present. */
  hasPrimalKnowledge: boolean;
  /** Wizard Scholar: skill keys offered (empty = feature absent). */
  scholarSkillKeys: string[];
  /** Ranger Deft Explorer present. */
  hasDeftExplorer: boolean;
  /** Rogue Thieves' Cant present. */
  hasThievesCant: boolean;
  /** Sorcerer Metamagic: options + how many to pick (null = absent). */
  metamagic: { options: OptionListEntry[]; count: number } | null;
  /** Warlock Eldritch Invocations: options + how many known (null = absent). */
  invocations: { options: OptionListEntry[]; count: number } | null;
  /** Mystic Arcanum: spell level per gain ≤ character level (e.g. [6, 7]). */
  mysticArcanumSpellLevels: number[];
  /** Wizard 18 Spell Mastery present. */
  hasSpellMastery: boolean;
  /** Wizard 20 Signature Spells present. */
  hasSignatureSpells: boolean;
  /** Ability Score Improvement gains ≤ level. */
  asiGainCount: number;
  /** Level 19+ Epic Boon present. */
  hasEpicBoon: boolean;
  /** Fighting Style feature present (classes whose desc has no inline options pick a feat instead). */
  hasFightingStyle: boolean;
}

const MYSTIC_ARCANUM_LEVEL_BY_GAIN: Record<number, number> = { 11: 6, 13: 7, 15: 8, 17: 9 };

/** Enumerates every remaining class choice the AI must fill, gated by `level`. */
export function extractAdvancedClassChoices(
  normalized: unknown,
  level: number
): AdvancedClassChoices {
  const empty: AdvancedClassChoices = {
    weaponMasteryCount: 0,
    expertiseCount: 0,
    hasPrimalKnowledge: false,
    scholarSkillKeys: [],
    hasDeftExplorer: false,
    hasThievesCant: false,
    metamagic: null,
    invocations: null,
    mysticArcanumSpellLevels: [],
    hasSpellMastery: false,
    hasSignatureSpells: false,
    asiGainCount: 0,
    hasEpicBoon: false,
    hasFightingStyle: false,
  };
  if (!normalized || typeof normalized !== 'object') return empty;
  const features = (normalized as Record<string, unknown>).features as
    | Array<NormalizedClassFeature & ClassTableFeature>
    | undefined;
  if (!Array.isArray(features)) return empty;
  const lv = Math.max(1, Math.min(20, Math.trunc(level) || 1));

  const byName = (nameLower: string) =>
    features.find((f) => (f.name ?? '').trim().toLowerCase() === nameLower);
  const has = (nameLower: string): boolean => {
    const f = byName(nameLower);
    return !!f && minGainLevel(f) <= lv;
  };

  const out: AdvancedClassChoices = { ...empty };

  if (has('weapon mastery')) {
    out.weaponMasteryCount = classTableValueByMatch(features, /weapon[-_\s]?mastery/i, lv) || 2;
  }

  const expertise = byName('expertise');
  if (expertise && minGainLevel(expertise) <= lv) {
    out.expertiseCount = getFeatureGainInfo(expertise, lv).count * 2;
  }

  out.hasPrimalKnowledge = has('primal knowledge');
  out.hasDeftExplorer = has('deft explorer');
  out.hasThievesCant = has("thieves' cant") || has('thieves cant');

  const scholar = byName('scholar');
  if (scholar && minGainLevel(scholar) <= lv) {
    const desc = scholar.desc ?? '';
    const m = desc.match(/skills[^:]*:\s*([^.]+)\./i) ?? desc.match(/:\s*([A-Z][^.]+)\./);
    if (m) {
      out.scholarSkillKeys = parseSkillProficienciesText(`Choose 1: ${m[1].trim()}`).keys;
    }
  }

  const metamagic = byName('metamagic');
  if (metamagic && minGainLevel(metamagic) <= lv) {
    const optionsFeature = features.find(
      (f) =>
        (f.name ?? '').trim().toLowerCase() === 'metamagic options' ||
        String((f as { key?: string }).key ?? '').includes('metamagic-options')
    );
    const options = parseMetamagicOptions(optionsFeature?.desc ?? metamagic.desc ?? '');
    if (options.length >= 2) {
      out.metamagic = { options, count: getFeatureGainInfo(metamagic, lv).count * 2 };
    }
  }

  const invocations = byName('eldritch invocations') ?? byName('eldritch invocation');
  if (invocations && minGainLevel(invocations) <= lv) {
    const optionsFeature = features.find(
      (f) =>
        /eldritch[-_\s]invocation/i.test(
          `${(f.name ?? '').trim().toLowerCase()} ${String((f as { key?: string }).key ?? '')}`
        ) && /option/i.test(`${f.name ?? ''} ${String((f as { key?: string }).key ?? '')}`)
    );
    const options = parseEldritchInvocationOptions(optionsFeature?.desc ?? '');
    const count = classTableValueByMatch(features, /invocation/i, lv);
    if (options.length > 0 && count > 0) {
      out.invocations = { options, count };
    }
  }

  const arcanum = byName('mystic arcanum');
  if (arcanum && minGainLevel(arcanum) <= lv) {
    const gains = getFeatureGainInfo(arcanum, lv);
    out.mysticArcanumSpellLevels = gains.levels.map((gl, i) => {
      const fromDetail = Number((gains.details[i] ?? '').replace(/[^0-9]/g, ''));
      return fromDetail >= 6 && fromDetail <= 9
        ? fromDetail
        : (MYSTIC_ARCANUM_LEVEL_BY_GAIN[gl] ?? 6);
    });
  }

  out.hasSpellMastery = has('spell mastery');
  out.hasSignatureSpells = has('signature spells');

  const asi = byName('ability score improvement');
  if (asi && minGainLevel(asi) <= lv) {
    out.asiGainCount = getFeatureGainInfo(asi, lv).count;
  }

  out.hasEpicBoon = has('epic boon');
  out.hasFightingStyle = has('fighting style');

  return out;
}

export interface RaceTraitChoice {
  /** Trait display name (featureChoices key). */
  trait: string;
  options: FeatureTraitOption[];
  /** Trait also needs an Int/Wis/Cha spellcasting-ability pick (lineages/legacies). */
  needsSpellcastingAbility: boolean;
  /** Elven Lineage: the high-elf option additionally grants a wizard-cantrip pick. */
  isElvenLineage: boolean;
}

export interface RaceChoiceOptions {
  selectableTraits: RaceTraitChoice[];
  /** Keen Senses skill options (empty = trait absent). */
  keenSensesSkillKeys: string[];
  /** Human Skillful (any skill). */
  hasSkillful: boolean;
  /** Human Versatile (pick an Origin feat). */
  hasVersatile: boolean;
}

/** Race-trait name keywords that mark a selectable lineage/ancestry/legacy choice. */
export const SELECTABLE_TRAIT_KEYWORDS = ['lineage', 'ancestry', 'legacy'];

/** Enumerates the race traits with pending selections (lineages, Keen Senses, Skillful, Versatile). */
export function extractRaceChoiceOptions(normalized: unknown): RaceChoiceOptions {
  const out: RaceChoiceOptions = {
    selectableTraits: [],
    keenSensesSkillKeys: [],
    hasSkillful: false,
    hasVersatile: false,
  };
  if (!normalized || typeof normalized !== 'object') return out;
  const traits = (normalized as Record<string, unknown>).traits as
    | Array<{ name?: string; desc?: string }>
    | undefined;
  if (!Array.isArray(traits)) return out;

  for (const t of traits) {
    const name = (t.name ?? '').trim();
    const nameLower = name.toLowerCase();
    const desc = typeof t.desc === 'string' ? t.desc : '';
    if (!name) continue;

    if (SELECTABLE_TRAIT_KEYWORDS.some((k) => nameLower.includes(k))) {
      const options = parseTraitOptions(desc);
      if (options.length >= 2) {
        out.selectableTraits.push({
          trait: name,
          options,
          needsSpellcastingAbility: /intelligence,\s*wisdom,\s*(?:or|and)\s*charisma/i.test(desc),
          isElvenLineage: nameLower === 'elven lineage',
        });
      }
      continue;
    }
    if (nameLower === 'keen senses') {
      const m = desc.match(/proficiency in\s+(?:the\s+)?(.+?)\s+skills?\b/i);
      if (m)
        out.keenSensesSkillKeys = parseSkillProficienciesText(`Choose one: ${m[1].trim()}`).keys;
      continue;
    }
    if (nameLower === 'skillful') out.hasSkillful = true;
    if (nameLower === 'versatile') out.hasVersatile = true;
  }
  return out;
}

export interface BackgroundAbilityOption {
  totalPoints: number;
  maxPerAbility: number;
  /** Canonical ability names allowed to receive the increase (empty = all six). */
  allowedAbilityNames: string[];
}

export interface BackgroundChoiceOptions {
  /** Fixed skill proficiencies granted by the background (already resolved to keys). */
  fixedSkillKeys: string[];
  /** Background equipment bundles (Option A/B/...). */
  equipment: EquipmentBundleOption[];
  /** Ability-score increase rule, when the background grants one. */
  abilityScore: BackgroundAbilityOption | null;
  /** Names of feats the background grants (origin feat). */
  featNames: string[];
}

interface NormalizedBenefit {
  type?: string;
  name?: string;
  desc?: string;
}

/** Reads the background's fixed skills, equipment bundles, ability-score rule and feats. */
export function extractBackgroundChoiceOptions(normalized: unknown): BackgroundChoiceOptions {
  const empty: BackgroundChoiceOptions = {
    fixedSkillKeys: [],
    equipment: [],
    abilityScore: null,
    featNames: [],
  };
  if (!normalized || typeof normalized !== 'object') return empty;
  const norm = normalized as Record<string, unknown>;
  const benefits = norm.benefits as NormalizedBenefit[] | undefined;
  if (!Array.isArray(benefits)) return empty;

  const out: BackgroundChoiceOptions = {
    ...empty,
    fixedSkillKeys: [],
    equipment: [],
    featNames: [],
  };

  const skillBenefit = benefits.find((b) => (b.type ?? '').toLowerCase() === 'skill_proficiency');
  if (skillBenefit) {
    const desc = (skillBenefit.desc ?? skillBenefit.name ?? '') as string;
    const { keys, chooseN } = parseSkillProficienciesText(desc);
    out.fixedSkillKeys = chooseN != null ? keys.slice(0, chooseN) : keys;
  }

  const equipmentBenefit = benefits.find((b) => (b.type ?? '').toLowerCase() === 'equipment');
  if (equipmentBenefit) {
    out.equipment = parseStartingEquipmentOptions((equipmentBenefit.desc as string) ?? '');
  }

  const abilityBenefit = benefits.find((b) => (b.type ?? '').toLowerCase() === 'ability_score');
  if (abilityBenefit) {
    const desc = ((abilityBenefit.desc ?? abilityBenefit.name) as string) ?? '';
    const pointsMatch = desc.match(/(\d+)\s*points?/i);
    const totalPoints = pointsMatch ? Math.min(6, Math.max(1, parseInt(pointsMatch[1], 10))) : 3;
    const allowed = parseAllowedAbilityNamesFromDesc(desc);
    out.abilityScore = {
      totalPoints,
      maxPerAbility: 2,
      allowedAbilityNames: allowed.length > 0 ? allowed : [...DND_ABILITY_NAMES],
    };
  }

  // Open5e stores the feat's actual name in `desc` (name is the literal label "Feat") — same
  // precedence the web derivation uses for the featureDetail name, so `fd:` keys match.
  out.featNames = benefits
    .filter((b) => (b.type ?? '').toLowerCase() === 'feat')
    .map((b) => (b.desc ?? b.name ?? '').trim())
    .filter(Boolean);

  return out;
}
