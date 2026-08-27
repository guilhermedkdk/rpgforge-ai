// Markdown / description normalization for feature + spell-list rendering (pure text transforms).

// Roman numeral (I–IX) to level number for spell list headings.
const ROMAN_TO_LEVEL: Record<string, number> = {
  I: 1,
  II: 2,
  III: 3,
  IV: 4,
  V: 5,
  VI: 6,
  VII: 7,
  VIII: 8,
  IX: 9,
};

/**
 * Returns the unified bold level title (Bard style): "**Cantrips (Level 0)**" or "**Level N**".
 * Takes the title text (e.g. "Cantrips (Level 0 Cleric Spells)", "Table: Level 1 Cleric Spells", "#### Level 4 Cleric Spells").
 */
function spellListLevelToBold(title: string): string | null {
  const t = title.trim();
  const lower = t.toLowerCase();
  if (lower.includes('cantrips') && lower.includes('level 0')) return '**Cantrips (Level 0)**';
  const levelDigitMatch = t.match(/\blevel\s*(\d+)\b/i);
  if (levelDigitMatch) return `**Level ${levelDigitMatch[1]}**`;
  const levelRomanMatch = t.match(/\blevel\s*(I{1,3}|IV|V|VI{0,3}|IX)\b/i);
  if (levelRomanMatch) {
    const num = ROMAN_TO_LEVEL[levelRomanMatch[1].toUpperCase()];
    if (num != null) return `**Level ${num}**`;
  }
  const levelOnlyDigitMatch = t.match(/^\s*LEVEL\s+(\d+)\s+/i);
  if (levelOnlyDigitMatch) return `**Level ${levelOnlyDigitMatch[1]}**`;
  const onlyRomanMatch = t.match(/^\s*LEVEL\s+(I{1,3}|IV|V|VI{0,3}|IX)\s+/i);
  if (onlyRomanMatch) {
    const num = ROMAN_TO_LEVEL[onlyRomanMatch[1].toUpperCase()];
    if (num != null) return `**Level ${num}**`;
  }
  return null;
}

/**
 * Unifies the level titles in spell lists (Bard Spell List, Cleric Spell List, etc.)
 * to the Bard style: **Cantrips (Level 0)** and **Level 1** (bold, normal font).
 * Handles: "Table: Cantrips (Level 0 Cleric Spells)", "Table: Level N ... Spells", and "#### Level N ..." headings.
 */
export function normalizeSpellListLevelHeadings(md: string): string {
  if (!md.trim()) return md;
  const lines = md.split('\n');
  const out: string[] = [];
  for (const line of lines) {
    // Markdown heading: # a ## ### #### etc.
    const headingMatch = line.match(/^(#{1,6})\s*(.+)$/);
    if (headingMatch) {
      const bold = spellListLevelToBold(headingMatch[2]);
      if (bold) {
        out.push(bold);
        continue;
      }
      out.push(line);
      continue;
    }
    // "Table: Cantrips (Level 0 Cleric Spells)" / "Table: Level 1 Cleric Spells" (other classes)
    const tableMatch = line.match(/^Table:\s*(.+)$/);
    if (tableMatch) {
      const bold = spellListLevelToBold(tableMatch[1]);
      if (bold) {
        out.push(bold);
        continue;
      }
    }
    out.push(line);
  }
  return out.join('\n');
}

export function normalizeFeatureDesc(desc: string | undefined): string {
  if (!desc) return '';
  let text = desc.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  // Convert "Table: Name" lines into a markdown section heading.
  text = text.replace(/^Table:\s*([^\n]+)$/gm, '#### $1');
  return text;
}

/** Placeholders inserted into the Spellcasting desc to position tables. Use @@ so they aren't interpreted as markdown. */
export const SPELLCASTING_TABLE_PLACEHOLDERS = {
  cantrips: '@@TABLE_CANTRIPS@@',
  spellSlots: '@@TABLE_SPELL_SLOTS@@',
  preparedSpells: '@@TABLE_PREPARED_SPELLS@@',
} as const;

/**
 * Inserts placeholders into the Spellcasting feature description so tables
 * render after each matching section (Cantrips → Cantrips table, etc.).
 */
export function injectSpellcastingTablePlaceholders(desc: string, tableLabels: string[]): string {
  if (!desc.trim()) return desc;
  const hasCantrips = tableLabels.some((l) => l.toLowerCase() === 'cantrips');
  const hasSlots = tableLabels.some((l) => l.toLowerCase().includes('slots'));
  const hasPrepared = tableLabels.some((l) => l.toLowerCase().includes('prepared spells'));
  if (!hasCantrips && !hasSlots && !hasPrepared) return desc;

  const block = '\n\n';
  let out = desc;
  // Insert from end to start so indices don't shift.
  // Before "Spellcasting Ability." → Prepared Spells table
  if (hasPrepared) {
    const re = /(\n\n)((?:\*\*)?Spellcasting\s+Ability\.)/i;
    out = out.replace(re, `$1${SPELLCASTING_TABLE_PLACEHOLDERS.preparedSpells}${block}$2`);
  }
  // Before "Prepared Spells (of Level 1+)." → Spell Slots tables
  if (hasSlots) {
    const re = /(\n\n)((?:\*\*)?Prepared\s+Spells(?:\s+of\s+Level\s+1\+)?\.?)/i;
    out = out.replace(re, `$1${SPELLCASTING_TABLE_PLACEHOLDERS.spellSlots}${block}$2`);
  }
  // Before "Spell Slots." → Cantrips table
  if (hasCantrips) {
    const re = /(\n\n)((?:\*\*)?Spell\s+Slots\.)/i;
    out = out.replace(re, `$1${SPELLCASTING_TABLE_PLACEHOLDERS.cantrips}${block}$2`);
  }
  return out;
}
