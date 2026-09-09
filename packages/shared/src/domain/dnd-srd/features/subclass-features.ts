/**
 * Subclass-feature logic: option menus (Hunter's Prey, Elemental Affinity, Fiendish
 * Resilience, Circle of the Land) and the always-prepared spell tables
 * (Life Domain / Oath of Devotion / Fiend / Draconic Spells + Circle of the Land per land).
 */
import { DND_DAMAGE_TYPES } from '../options/character-options';
import { normalizeName } from '../util/text-utils';

export const isBonusProficienciesFeatureName = (name: string): boolean =>
  normalizeName(name) === 'bonus proficiencies';

export const isMagicalDiscoveriesFeatureName = (name: string): boolean =>
  normalizeName(name) === 'magical discoveries';

export const isAdditionalFightingStyleFeatureName = (name: string): boolean =>
  normalizeName(name) === 'additional fighting style';

export const isDraconicResilienceFeatureName = (name: string): boolean =>
  normalizeName(name) === 'draconic resilience';

export const isEvocationSavantFeatureName = (name: string): boolean =>
  normalizeName(name) === 'evocation savant';

export const isElementalAffinityFeatureName = (name: string): boolean =>
  normalizeName(name) === 'elemental affinity';

export const isFiendishResilienceFeatureName = (name: string): boolean =>
  normalizeName(name) === 'fiendish resilience';

export const isCircleOfTheLandSpellsFeatureName = (name: string): boolean =>
  normalizeName(name) === 'circle of the land spells';

/** Features whose options are name-only (no text block): rendered as a simple list. */
export const isTypeChoiceSubclassFeatureName = (name: string): boolean =>
  isElementalAffinityFeatureName(name) ||
  isFiendishResilienceFeatureName(name) ||
  isCircleOfTheLandSpellsFeatureName(name);

const slugify = (s: string): string =>
  s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-');

export interface SimpleOption {
  key: string;
  label: string;
}

/** "Choose one of those types: Acid, Cold, Fire, Lightning, or Poison." → the listed options. */
export function parseInlineTypeOptions(desc: string): SimpleOption[] {
  const m = desc.match(/choose one of (?:those|the following) types?:\s*([^.]+)\./i);
  if (!m) return [];
  return m[1]
    .split(/\s*,\s*|\s+or\s+/i)
    .map((s) => s.trim().replace(/^or\s+/i, ''))
    .filter(Boolean)
    .map((label) => ({ key: slugify(label), label }));
}

/** "Choose one damage type, other than Force" → all damage types minus the excluded ones. */
export function parseDamageTypeOptions(desc: string): SimpleOption[] {
  if (!/choose one damage type/i.test(desc)) return [];
  const excluded = new Set<string>();
  const m = desc.match(/other than\s+([A-Za-z, ]+?)(?:,|\.|\s+whenever)/i);
  if (m) {
    for (const part of m[1].split(/\s*,\s*|\s+or\s+|\s+and\s+/i)) {
      const t = part.trim().toLowerCase();
      if (t) excluded.add(t);
    }
  }
  return DND_DAMAGE_TYPES.filter((t) => !excluded.has(t.toLowerCase())).map((label) => ({
    key: slugify(label),
    label,
  }));
}

// --- Spell tables ---

interface NamedSpellTable {
  /** Title after "Table: " (e.g. "Life Domain Spells", "Arid Land"). */
  title: string;
  rows: Array<{ level: number; spellNames: string[] }>;
}

const splitSpellCell = (cell: string): string[] =>
  cell
    .replace(/\*\*/g, '')
    .replace(/\*/g, '')
    .split(/\s*,\s*/)
    .map((s) => s.trim())
    .filter(Boolean);

/**
 * Extracts the "Table: X" tables with the `|<Class> Level|Spells|` format from the feature text.
 * Untitled tables inherit their index as the title.
 */
export function parseSubclassSpellTables(desc: string): NamedSpellTable[] {
  const out: NamedSpellTable[] = [];
  const lines = desc.split('\n');
  let pendingTitle: string | null = null;
  let current: NamedSpellTable | null = null;

  const closeCurrent = () => {
    if (current && current.rows.length > 0) out.push(current);
    current = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    // The featureDetail desc is normalized ("Table: X" becomes "#### X"), so accept both.
    const titleMatch =
      line.match(/^\*{0,2}Table:\s*(.+?)\*{0,2}$/i) ?? line.match(/^#{2,6}\s+(.+?)\s*$/);
    if (titleMatch) {
      closeCurrent();
      pendingTitle = titleMatch[1].trim();
      continue;
    }
    if (!line.startsWith('|')) {
      closeCurrent();
      if (line.length > 0) pendingTitle = null;
      continue;
    }
    const cells = line
      .split('|')
      .map((c) => c.trim())
      .filter((c) => c.length > 0);
    if (cells.length < 2) continue;
    if (cells.every((c) => /^:?-+:?$/.test(c))) continue;
    if (!current) {
      current = { title: pendingTitle ?? `Table ${out.length + 1}`, rows: [] };
      pendingTitle = null;
      // Header row (`|Cleric Level|Prepared Spells|`): skip without recording.
      if (/level/i.test(cells[0])) continue;
    }
    const level = parseInt(cells[0].replace(/[^0-9]/g, ''), 10);
    if (Number.isNaN(level) || level < 1 || level > 20) continue;
    const spellNames = splitSpellCell(cells[1] ?? '');
    if (spellNames.length > 0) current.rows.push({ level, spellNames });
  }
  closeCurrent();
  return out;
}

/**
 * Splits the desc at the first table title so the choice can be rendered between the intro
 * text and the tables. Returns null when there is no table.
 */
export function splitDescAtFirstTable(desc: string): { intro: string; tables: string } | null {
  const lines = desc.split('\n');
  const idx = lines.findIndex((l) => {
    const t = l.trim();
    return /^\*{0,2}Table:\s*\S/i.test(t) || /^#{2,6}\s+\S/.test(t);
  });
  if (idx < 0) return null;
  return {
    intro: lines.slice(0, idx).join('\n').trim(),
    tables: lines.slice(idx).join('\n').trim(),
  };
}

/**
 * Circle of the Land terrain options: one per "Table: X Land" table.
 * Only considers features with 2+ tables (a single table is not a choice).
 */
export function parseLandChoiceOptions(desc: string): SimpleOption[] {
  const tables = parseSubclassSpellTables(desc);
  if (tables.length < 2) return [];
  return tables.map((t) => ({ key: slugify(t.title), label: t.title }));
}

/**
 * Always-prepared spells granted by the feature up to the current level.
 * With multiple tables (Circle of the Land), the choice (`selectedTableKey`) is required;
 * with a single table (Life Domain etc.) the choice is ignored.
 */
export function getSubclassTableGrantedSpellNames(
  desc: string,
  characterLevel: number,
  selectedTableKey?: string | null
): string[] {
  const tables = parseSubclassSpellTables(desc);
  if (tables.length === 0) return [];
  let table: NamedSpellTable | undefined;
  if (tables.length === 1) {
    table = tables[0];
  } else {
    if (!selectedTableKey) return [];
    table = tables.find((t) => slugify(t.title) === selectedTableKey);
  }
  if (!table) return [];
  const names: string[] = [];
  const seen = new Set<string>();
  for (const row of table.rows) {
    if (row.level > characterLevel) continue;
    for (const name of row.spellNames) {
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      names.push(name);
    }
  }
  return names;
}

/**
 * A subclass feature's choice options, when present:
 * - "one of the following feature options" → `**Name.**` blocks (Hunter's Prey, Defensive Tactics)
 *   are left to the caller (parseTraitOptions), signaled by `useTraitOptions`;
 * - Elemental Affinity → types listed in the text;
 * - Fiendish Resilience → damage types (minus the excluded ones);
 * - Circle of the Land Spells → terrains (one per table).
 */
export function getSubclassSimpleOptions(name: string, desc: string): SimpleOption[] {
  if (isElementalAffinityFeatureName(name)) return parseInlineTypeOptions(desc);
  if (isFiendishResilienceFeatureName(name)) return parseDamageTypeOptions(desc);
  if (isCircleOfTheLandSpellsFeatureName(name)) return parseLandChoiceOptions(desc);
  return [];
}

/** Gate for applying parseTraitOptions to subclass features (avoids false positives like Survivor). */
export function subclassFeatureHasTraitOptionChoice(desc: string): boolean {
  return /one of the following (?:feature )?options/i.test(desc);
}

/** Bonus Proficiencies (College of Lore): "proficiency with three skills of your choice". */
export const BONUS_PROFICIENCIES_SKILL_PICKS = 3;

/** Magical Discoveries (College of Lore): "choose two spells from the Cleric, Druid or Wizard list". */
export const MAGICAL_DISCOVERIES_SPELL_PICKS = 2;

/** The three class lists Magical Discoveries may draw from. */
export const MAGICAL_DISCOVERIES_SPELL_LISTS = ['Cleric', 'Druid', 'Wizard'] as const;

/** Base free Evocation spells granted at the subclass (level 3), each capped to level ≤ 2. */
export const EVOCATION_SAVANT_BASE_FREE_COUNT = 2;

/** Max spell level of the base free grant ("no higher than level 2"). */
export const EVOCATION_SAVANT_BASE_MAX_LEVEL = 2;

/**
 * Evocation Savant: 2 free spellbook spells on taking the subclass (level 3), plus 1 at each new
 * slot level after it. The Wizard unlocks those at 5, 7, 9, 11, 13, 15 and 17.
 */
export function evocationSavantFreeSpellCount(characterLevel: number): number {
  const NEW_SLOT_LEVELS_AFTER_SUBCLASS = [5, 7, 9, 11, 13, 15, 17];
  return (
    EVOCATION_SAVANT_BASE_FREE_COUNT +
    NEW_SLOT_LEVELS_AFTER_SUBCLASS.filter((l) => l <= characterLevel).length
  );
}

/**
 * Free Evocation picks beyond the base grant (1 per new spell-slot level gained after the
 * subclass). These may be any level the character can cast; the base grant is fixed at ≤ level 2.
 * So picks ABOVE level 2 are capped at this count.
 */
export function evocationSavantIncrementalFreeCount(characterLevel: number): number {
  return Math.max(
    0,
    evocationSavantFreeSpellCount(characterLevel) - EVOCATION_SAVANT_BASE_FREE_COUNT
  );
}

/** Highest spell level castable by a full caster (Wizard): ceil(level/2), capped at 9. */
export function fullCasterMaxSpellLevel(characterLevel: number): number {
  return Math.max(1, Math.min(9, Math.ceil(Math.max(1, Math.min(20, characterLevel)) / 2)));
}
