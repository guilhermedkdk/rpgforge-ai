/**
 * Race traits with a wide markdown table: first column = option (Lineage / Legacy …),
 * other columns = "Level 1", "Level 3", …
 *
 * Level-1 cantrip names are parsed from prose with the pattern "the … cantrip"
 * (used by Elven Lineage, Fiendish Legacy, and similar).
 */

type WideRaceTableKind = 'lineage' | 'legacy';

/**
 * Match "... the {Name} cantrip ..." and return {Name} (strip markdown first).
 * The name must stay in the same sentence as `cantrip` (no `.` in between), so we do not
 * span from an earlier "The ..." (e.g. Drow: "The range of your Darkvision ... the X cantrip").
 */
function extractCantripNameAfterTheBeforeCantrip(source: string): string | null {
  const plain = source.replace(/\*\*/g, '').replace(/\*(?![*\s])/g, '');
  const re = /\bthe\s+([^.\n]+?)\s+cantrip\b/gi;
  let best: string | null = null;
  let bestLen = Infinity;
  let m: RegExpExecArray | null;
  while ((m = re.exec(plain)) !== null) {
    const inner = m[1].trim().replace(/\s+/g, ' ');
    if (inner.length < 2 || inner.length > 80) continue;
    if (/^(that|a|an)\s+/i.test(inner)) continue;
    if (inner.length < bestLen) {
      best = inner;
      bestLen = inner.length;
    }
  }
  return best;
}

function normalizeLineageSelectionKey(key: string): string {
  return key.trim().toLowerCase().replace(/\s+/g, '-');
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findOptionBlockStart(desc: string, label: string): number {
  const l = label.trim();
  if (!l) return -1;
  const variants = [
    `\n\n**${l}.**`,
    `\n\n${l}.`,
    `\n\n**${l}**`,
    `\n\n${l}:`,
    `**${l}.**`,
    `${l}.`,
    `**${l}**`,
    `${l}:`,
  ];
  let best = -1;
  for (const v of variants) {
    const i = desc.indexOf(v);
    if (i >= 0 && (best < 0 || i < best)) best = i;
  }
  if (best >= 0) return best;
  const rowPat = new RegExp(`(^|\\n)\\|\\s*${escapeRegExp(l)}\\s*\\|`, 'i');
  const rowM = rowPat.exec(desc);
  return rowM && typeof rowM.index === 'number' ? rowM.index : -1;
}

function extractTraitOptionBlock(desc: string, label: string, otherOptionLabels: string[]): string {
  const start = findOptionBlockStart(desc, label);
  if (start < 0) return desc.trim();

  let end = desc.length;
  for (const other of otherOptionLabels) {
    const o = other.trim();
    if (!o || o === label.trim()) continue;
    const idx = findOptionBlockStart(desc, o);
    if (idx > start && idx < end) end = idx;
  }
  return desc.slice(start, end).trim();
}

function stripMdCell(s: string): string {
  return s.replace(/\*\*/g, '').replace(/\*/g, '').trim();
}

function spellSummaryFromCell(raw: string): string {
  const t = raw.trim();
  const bold = t.match(/\*\*([^*]+)\*\*/);
  if (bold) return bold[1].trim();
  const firstLine = t.split('\n')[0]?.trim() ?? t;
  const cleaned = stripMdCell(firstLine).replace(/^[*_`\s]+/, '');
  return cleaned.length > 120 ? `${cleaned.slice(0, 117)}…` : cleaned;
}

function splitMarkdownTables(text: string): string[][][] {
  const tables: string[][][] = [];
  let current: string[][] = [];
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (line.startsWith('|')) {
      const cells = line
        .split('|')
        .map((c) => c.trim())
        .filter((c) => c.length > 0);
      if (cells.length === 0) continue;
      if (cells.every((c) => /^:?-+:?$/.test(c))) continue;
      current.push(cells);
    } else {
      if (current.length >= 2) tables.push(current);
      current = [];
    }
  }
  if (current.length >= 2) tables.push(current);
  return tables;
}

function firstColumnHeaderMatchesKind(header0: string, kind: WideRaceTableKind): boolean {
  const h = header0.toLowerCase();
  if (kind === 'lineage') return h.includes('lineage');
  return h.includes('legacy') || h.includes('fiendish');
}

function rowFirstCellMatchesSelection(
  firstCell: string,
  selectedKey: string,
  selectedLabel: string
): boolean {
  const nf = normalizeLineageSelectionKey(firstCell);
  const nk = normalizeLineageSelectionKey(selectedKey);
  const nl = normalizeLineageSelectionKey(selectedLabel);
  return nf === nk || nf === nl;
}

function milestoneLabelForLevel1Cell(raw: string): string {
  const cantrip = extractCantripNameAfterTheBeforeCantrip(raw);
  if (cantrip) return cantrip;
  return spellSummaryFromCell(raw);
}

type WideTableSelection = {
  dataRow: string[];
  colByMilestone: Map<number, number>;
};

function findWideTableSelection(
  traitDesc: string,
  selectedKey: string,
  selectedLabel: string,
  tableKind: WideRaceTableKind
): WideTableSelection | null {
  for (const tbl of splitMarkdownTables(traitDesc)) {
    if (tbl.length < 2) continue;
    const header = tbl[0].map((c) => stripMdCell(c).toLowerCase());
    if (!firstColumnHeaderMatchesKind(header[0] ?? '', tableKind)) continue;

    const colByMilestone = new Map<number, number>();
    for (let c = 1; c < header.length; c++) {
      const m = header[c].match(/\blevel\s*(\d+)\b/i);
      if (m) {
        const lvl = parseInt(m[1], 10);
        if (!Number.isNaN(lvl) && lvl >= 1 && lvl <= 20) {
          colByMilestone.set(lvl, c);
        }
      }
    }
    if (colByMilestone.size === 0) continue;

    let dataRow: string[] | null = null;
    for (let r = 1; r < tbl.length; r++) {
      const row = tbl[r];
      if (row.length === 0) continue;
      const first = stripMdCell(row[0] ?? '');
      if (!first) continue;
      if (rowFirstCellMatchesSelection(first, selectedKey, selectedLabel)) {
        dataRow = row;
        break;
      }
    }
    if (!dataRow) continue;
    return { dataRow, colByMilestone };
  }
  return null;
}

function parseFromWideMilestoneTable(
  traitDesc: string,
  selectedKey: string,
  selectedLabel: string,
  characterLevel: number,
  tableKind: WideRaceTableKind
): string[] | null {
  const found = findWideTableSelection(traitDesc, selectedKey, selectedLabel, tableKind);
  if (!found) return null;
  const { dataRow, colByMilestone } = found;

  const milestones = [...colByMilestone.keys()]
    .filter((m) => m <= characterLevel)
    .sort((a, b) => a - b);

  const out: string[] = [];
  for (const m of milestones) {
    const col = colByMilestone.get(m);
    if (col === undefined || col >= dataRow.length) continue;
    const raw = (dataRow[col] ?? '').trim();
    if (!raw) continue;

    if (m === 1) {
      out.push(milestoneLabelForLevel1Cell(raw));
      continue;
    }
    out.push(spellSummaryFromCell(raw));
  }
  return out;
}

function parseLevelSpellRowsFromTable(rows: string[][]): Array<{ level: number; raw: string }> {
  if (rows.length < 2) return [];
  const header = rows[0].map((c) => stripMdCell(c).toLowerCase());
  let levelIdx = header.findIndex((h) => /\blevel\b/.test(h));
  if (levelIdx < 0) levelIdx = 0;
  let spellIdx = header.findIndex((h, i) => i !== levelIdx && h.length > 0);
  if (spellIdx < 0 && header.length > 1) spellIdx = 1;
  if (spellIdx < 0) return [];

  const out: Array<{ level: number; raw: string }> = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (row.length <= Math.max(levelIdx, spellIdx)) continue;
    const lv = parseInt(stripMdCell(row[levelIdx] ?? ''), 10);
    if (Number.isNaN(lv) || lv < 1 || lv > 20) continue;
    const raw = row[spellIdx] ?? '';
    if (!raw.trim()) continue;
    out.push({ level: lv, raw });
  }
  return out;
}

function collectLevelSpellRowsFromBlock(block: string): Array<{ level: number; raw: string }> {
  const merged: Array<{ level: number; raw: string }> = [];
  for (const tbl of splitMarkdownTables(block)) {
    merged.push(...parseLevelSpellRowsFromTable(tbl));
  }
  return merged.sort((a, b) => a.level - b.level);
}

function getRaceMilestoneSpells(
  traitDesc: string,
  options: Array<{ key: string; label: string }>,
  selectedKey: string | null,
  characterLevel: number,
  tableKind: WideRaceTableKind
): string[] {
  if (!selectedKey || characterLevel < 1 || options.length === 0) return [];

  const opt = options.find((o) => o.key === selectedKey);
  if (!opt) return [];

  const wide = parseFromWideMilestoneTable(
    traitDesc,
    selectedKey,
    opt.label,
    characterLevel,
    tableKind
  );
  if (wide !== null) return wide;

  const otherLabels = options.map((o) => o.label.trim()).filter(Boolean);
  const block = extractTraitOptionBlock(traitDesc, opt.label, otherLabels);
  const rows = collectLevelSpellRowsFromBlock(block);

  const byLevel = new Map<number, string>();
  for (const { level, raw } of rows) {
    if (level > characterLevel) continue;
    if (level === 1) {
      byLevel.set(1, milestoneLabelForLevel1Cell(raw));
      continue;
    }
    if (!byLevel.has(level)) byLevel.set(level, spellSummaryFromCell(raw));
  }

  const levels = [...byLevel.keys()].filter((l) => l <= characterLevel).sort((a, b) => a - b);
  return levels.map((l) => byLevel.get(l)!).filter(Boolean);
}

export function getElvenLineageSpellsForCharacter(
  traitDesc: string,
  options: Array<{ key: string; label: string }>,
  selectedKey: string | null,
  characterLevel: number
): string[] {
  return getRaceMilestoneSpells(traitDesc, options, selectedKey, characterLevel, 'lineage');
}

export function getFiendishLegacySpellsForCharacter(
  traitDesc: string,
  options: Array<{ key: string; label: string }>,
  selectedKey: string | null,
  characterLevel: number
): string[] {
  return getRaceMilestoneSpells(traitDesc, options, selectedKey, characterLevel, 'legacy');
}

function optionMatchesForestGnome(label: string, selectedKey: string): boolean {
  const l = label.trim().toLowerCase();
  const k = normalizeLineageSelectionKey(selectedKey);
  if (l === 'forest gnome' || l.startsWith('forest gnome')) return true;
  return k.includes('forest') && k.includes('gnome');
}

function optionMatchesRockGnome(label: string, selectedKey: string): boolean {
  const l = label.trim().toLowerCase();
  const k = normalizeLineageSelectionKey(selectedKey);
  if (l === 'rock gnome' || l.startsWith('rock gnome')) return true;
  return k.includes('rock') && k.includes('gnome');
}

/**
 * Gnomish Lineage (2024): fixed spell grants per sublineage, auto-placed on the sheet
 * (same merge path as other race-granted spells).
 */
export function getGnomishLineageExplicitGrants(
  selectedKey: string | null,
  options: Array<{ key: string; label: string }>,
): Array<{ name: string; spellLevel: number }> {
  if (!selectedKey || options.length === 0) return [];
  const opt = options.find((o) => o.key === selectedKey);
  if (!opt) return [];
  const lab = opt.label.trim();
  if (optionMatchesForestGnome(lab, selectedKey)) {
    return [
      { name: 'Minor Illusion', spellLevel: 0 },
      { name: 'Speak with Animals', spellLevel: 1 },
    ];
  }
  if (optionMatchesRockGnome(lab, selectedKey)) {
    return [
      { name: 'Mending', spellLevel: 0 },
      { name: 'Prestidigitation', spellLevel: 0 },
    ];
  }
  return [];
}

/** Display names for the feature summary (e.g. features list). */
export function getGnomishLineageSpellNamesForCharacter(
  selectedKey: string | null,
  options: Array<{ key: string; label: string }>,
): string[] {
  return getGnomishLineageExplicitGrants(selectedKey, options).map((g) => g.name);
}
