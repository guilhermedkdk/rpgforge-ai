/**
 * Open5e V2 → contentMd normalization for CLASS, BACKGROUND, and SPECIES (RACE).
 * Builds structured Markdown from raw JSON for easy consumption in the app.
 * @see docs/open5e_v2_contentmd_normalization.md
 */

type Raw = Record<string, unknown>;

// --- Utils -------------------------------------------------------------------

function cleanMd(text: string): string {
  if (!text || typeof text !== 'string') return '';
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+$/gm, '')
    .trim();
}

function mdHeader(name: string, raw: Raw): string {
  const doc = raw.document as { key?: string; name?: string } | undefined;
  const docKey = doc?.key ?? '';
  const docName = doc?.name ?? '';
  const url = (raw.url as string) ?? '';
  const lines = [
    `# ${name}`,
    '',
    '> Fonte: Open5e (v2)',
    `> Documento: ${docKey} — ${docName}`,
    url ? `> URL: ${url}` : '',
  ].filter(Boolean);
  return lines.join('\n');
}

function renderSection(title: string, body: string): string {
  const b = cleanMd(body);
  if (!b) return '';
  return `\n## ${title}\n\n${b}\n`;
}

function renderSubSection(title: string, body: string): string {
  const b = cleanMd(body);
  if (!b) return '';
  return `\n### ${title}\n\n${b}\n`;
}

function cleanTableMd(text: string): string {
  return text.replace(/^\s*\|\|\|?\s*\n?/, '').trim();
}

function tableLikeToBullets(text: string): string {
  const cleaned = cleanTableMd(text);
  if (!cleaned) return '';
  const lines = cleaned.split(/\n/);
  const bullets: string[] = [];
  for (const line of lines) {
    if (!line.includes('|')) continue;
    const cells = line
      .split('|')
      .map((c) => c.trim())
      .filter((c) => c.length > 0);
    if (cells.length < 2) continue;
    const isSeparator = cells.every((c) => /^-+$/.test(c));
    if (isSeparator) continue;
    const label = cells[0];
    const value = cells.slice(1).join(' — ').trim();
    if (!label || !value) continue;
    bullets.push(`- **${label}**: ${value}`);
  }
  return bullets.join('\n');
}

// --- CLASS -------------------------------------------------------------------

interface ClassFeature {
  name?: string;
  key?: string;
  desc?: string;
  feature_type?: string;
  gained_at?: number[] | { level?: number }[];
  data_for_class_table?: Array<{ level?: number; column_value?: string }>;
}

function normalizeClassContentMd(raw: Raw): string {
  const name = (raw.name as string) ?? (raw.key as string) ?? 'Class';
  const parts: string[] = [mdHeader(name, raw)];

  const desc = (raw.desc as string) ?? '';
  if (desc.trim()) {
    parts.push(renderSection('Visão geral', desc));
  }

  const features = (raw.features as ClassFeature[] | undefined) ?? [];
  const coreTraits = features.find(
    (f) => (f.feature_type ?? '').toUpperCase() === 'CORE_TRAITS_TABLE'
  );
  if (coreTraits?.desc) {
    parts.push(renderSection('Traços principais', tableLikeToBullets(coreTraits.desc)));
  }

  const hitPoints = raw.hit_points as {
    hit_dice_name?: string;
    hit_points_at_1st_level?: string;
    hit_points_at_higher_levels?: string;
  } | undefined;
  if (hitPoints) {
    const hpLines: string[] = [];
    if (hitPoints.hit_dice_name) hpLines.push(`- **Dado de Vida:** ${hitPoints.hit_dice_name}`);
    if (hitPoints.hit_points_at_1st_level)
      hpLines.push(`- **PV no 1º nível:** ${hitPoints.hit_points_at_1st_level}`);
    if (hitPoints.hit_points_at_higher_levels)
      hpLines.push(`- **PV nos níveis seguintes:** ${hitPoints.hit_points_at_higher_levels}`);
    if (hpLines.length > 0) {
      parts.push(renderSection('Dados de pontos de vida', hpLines.join('\n')));
    }
  }

  const savingThrows = (raw.saving_throws as Array<{ name?: string }> | undefined) ?? [];
  if (savingThrows.length > 0) {
    const names = savingThrows.map((s) => s.name).filter(Boolean);
    parts.push(renderSection('Salvaguardas', names.map((n) => `- ${n}`).join('\n')));
  }

  const ft = (f: ClassFeature) => (f.feature_type ?? '').toUpperCase();
  const tableFeatures = features.filter(
    (f) => ft(f) === 'PROFICIENCY_BONUS' || ft(f) === 'CLASS_TABLE_DATA'
  );
  if (tableFeatures.length > 0) {
    const levelMap = new Map<number, Record<string, string>>();
    const colOrder: string[] = [];
    for (const f of tableFeatures) {
      const colName = (f.name as string) ?? '';
      if (colName && !colOrder.includes(colName)) colOrder.push(colName);
      const data = (f.data_for_class_table as Array<{ level?: number; column_value?: string }>) ?? [];
      for (const row of data) {
        const level = Number(row.level);
        if (!levelMap.has(level)) levelMap.set(level, {});
        levelMap.get(level)![colName] = row.column_value != null ? String(row.column_value) : '—';
      }
    }
    const levels = Array.from(levelMap.keys()).sort((a, b) => a - b);
    if (levels.length > 0) {
      const header = ['Level', ...colOrder].join(' | ');
      const sep = ['---', ...colOrder.map(() => '---')].join(' | ');
      const rows = levels.map((l) => {
        const row = levelMap.get(l)!;
        return [l, ...colOrder.map((c) => row[c] ?? '—')].join(' | ');
      });
      const table = [header, sep, ...rows].join('\n');
      parts.push(renderSection('Tabela da classe (progressão por nível)', table));
    }
  }

  const levelFeatures = features.filter(
    (f) => (f.feature_type ?? '').toUpperCase() === 'CLASS_LEVEL_FEATURE'
  );
  const byLevel = new Map<number, ClassFeature[]>();
  for (const f of levelFeatures) {
    const gainedAt = f.gained_at;
    const levels: number[] = [];
    if (Array.isArray(gainedAt)) {
      for (const x of gainedAt) {
        if (typeof x === 'number') levels.push(x);
        else if (x && typeof x === 'object' && 'level' in x) levels.push(Number((x as { level?: number }).level));
      }
    }
    for (const lvl of levels) {
      if (!byLevel.has(lvl)) byLevel.set(lvl, []);
      const list = byLevel.get(lvl)!;
      if (!list.some((x) => x.key === f.key)) list.push(f);
    }
  }
  const sortedLevels = Array.from(byLevel.keys()).sort((a, b) => a - b);
  if (sortedLevels.length > 0) {
    const levelParts: string[] = [];
    for (const lvl of sortedLevels) {
      const list = byLevel.get(lvl)!;
      list.sort((a, b) => ((a.name as string) ?? '').localeCompare((b.name as string) ?? ''));
      const bullets = list
        .map((f) => {
          const d = cleanMd((f.desc as string) ?? '');
          return d ? `- **${f.name}**: ${d}` : `- **${f.name}**`;
        })
        .join('\n\n');
      levelParts.push(renderSubSection(`Nível ${lvl}`, bullets));
    }
    parts.push('\n## Features por nível\n' + levelParts.join(''));
  }

  return cleanMd(parts.join(''));
}

// --- BACKGROUND --------------------------------------------------------------

interface BackgroundBenefit {
  name?: string;
  type?: string;
  desc?: string;
}

const BACKGROUND_TYPE_ORDER = [
  'ability_score',
  'skill_proficiency',
  'tool_proficiency',
  'feat',
  'equipment',
];

function normalizeBackgroundContentMd(raw: Raw): string {
  const name = (raw.name as string) ?? (raw.key as string) ?? 'Background';
  const parts: string[] = [mdHeader(name, raw)];

  const desc = (raw.desc as string) ?? '';
  if (desc.trim()) {
    parts.push(renderSection('Visão geral', desc));
  }

  const benefits = (raw.benefits as BackgroundBenefit[] | undefined) ?? [];
  const byType = new Map<string, BackgroundBenefit[]>();
  for (const b of benefits) {
    const t = (b.type as string) ?? 'other';
    if (!byType.has(t)) byType.set(t, []);
    byType.get(t)!.push(b);
  }
  const typeOrder = [...BACKGROUND_TYPE_ORDER];
  const otherTypes = Array.from(byType.keys()).filter((t) => !typeOrder.includes(t)).sort();
  const allTypes = [...typeOrder, ...otherTypes];
  const benefitParts: string[] = [];
  for (const typeKey of allTypes) {
    const list = byType.get(typeKey);
    if (!list?.length) continue;
    const sectionTitle = typeKey
      .split('_')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
    const body = list
      .map((b) => cleanMd((b.desc as string) ?? ''))
      .filter(Boolean)
      .join('\n\n');
    benefitParts.push(renderSubSection(sectionTitle, body));
  }
  if (benefitParts.length > 0) {
    parts.push('\n## Benefícios\n' + benefitParts.join(''));
  }

  return cleanMd(parts.join(''));
}

// --- SPECIES (RACE) ----------------------------------------------------------

interface SpeciesTrait {
  name?: string;
  type?: string;
  order?: number;
  desc?: string;
}

function normalizeSpeciesContentMd(raw: Raw): string {
  const name = (raw.name as string) ?? (raw.key as string) ?? 'Species';
  const parts: string[] = [mdHeader(name, raw)];

  const desc = (raw.desc as string) ?? '';
  if (desc.trim()) {
    parts.push(renderSection('Visão geral', desc));
  }

  const traits = (raw.traits as SpeciesTrait[] | undefined) ?? [];
  const sorted = [...traits].sort((a, b) => {
    const oa = Number(a.order);
    const ob = Number(b.order);
    if (oa !== ob) return oa - ob;
    return ((a.name as string) ?? '').localeCompare((b.name as string) ?? '');
  });
  for (const t of sorted) {
    const d = cleanMd((t.desc as string) ?? '');
    if (t.name) parts.push(renderSubSection(t.name, d || '(Sem descrição)'));
  }

  const isSubspecies = raw.is_subspecies === true;
  const subspeciesOf = raw.subspecies_of as { name?: string; key?: string } | undefined;
  if (isSubspecies && subspeciesOf) {
    const subName = subspeciesOf.name ?? subspeciesOf.key ?? '';
    parts.push(renderSection('Subspecies', `Esta é uma subespécie de **${subName}**.`));
  }

  return cleanMd(parts.join(''));
}

// --- Public API --------------------------------------------------------------

export function normalizeContentMdForKind(
  kind: 'CLASS' | 'BACKGROUND' | 'RACE',
  raw: Raw
): string {
  switch (kind) {
    case 'CLASS':
      return normalizeClassContentMd(raw);
    case 'BACKGROUND':
      return normalizeBackgroundContentMd(raw);
    case 'RACE':
      return normalizeSpeciesContentMd(raw);
    default:
      return '';
  }
}
