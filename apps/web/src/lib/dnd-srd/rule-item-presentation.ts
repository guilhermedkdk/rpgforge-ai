import type { RuleItemResponse } from '@rpgforce-ai/shared';

/** Label/value pairs read from `raw` for the picker preview (speed, size, proficiencies…). */
export function getDetailSnippets(item: RuleItemResponse): { label: string; value: string }[] {
  const raw = item.raw ?? {};
  const snippets: { label: string; value: string }[] = [];

  const hitDice = raw.hit_dice as string | undefined;
  if (hitDice && item.kind !== 'CLASS') snippets.push({ label: 'Hit Dice', value: hitDice });

  const speed = raw.speed as string | undefined;
  if (speed) snippets.push({ label: 'Speed', value: speed });

  const size = raw.size as string | undefined;
  if (size) snippets.push({ label: 'Size', value: size });

  const skillProficiencies = raw.skill_proficiencies as string | undefined;
  if (skillProficiencies) snippets.push({ label: 'Proficiencies', value: skillProficiencies });

  const languages = raw.languages as string | undefined;
  if (languages) snippets.push({ label: 'Languages', value: languages });

  const weaponProficiencies = raw.weapon_proficiencies as string | undefined;
  if (weaponProficiencies) snippets.push({ label: 'Weapons', value: weaponProficiencies });

  const armorProficiencies = raw.armor_proficiencies as string | undefined;
  if (armorProficiencies) snippets.push({ label: 'Armor', value: armorProficiencies });

  return snippets;
}

interface TableRow {
  label: string;
  value: string;
}

/** Parses an SRD core-traits-style markdown table (`|Label|Value|`) into label/value rows. */
function parseTableRows(text: string): TableRow[] {
  if (!text?.trim()) return [];
  const lines = text
    .replace(/^\s*\|\|\|?\s*\n?/, '')
    .trim()
    .split(/\n/);
  const rows: TableRow[] = [];
  for (const line of lines) {
    if (!line.includes('|')) continue;
    const cells = line
      .split('|')
      .map((c) => c.trim())
      .filter(Boolean);
    if (cells.length < 2) continue;
    if (cells.every((c) => /^-+$/.test(c))) continue;
    const label = cells[0];
    const value = cells.slice(1).join(' · ').trim();
    if (label && value) rows.push({ label, value });
  }
  return rows;
}

/** Converts a core-traits-style markdown table into a bullet list. */
export function tableLikeToBullets(text: string): string {
  return parseTableRows(text)
    .map(({ label, value }) => `- **${label}**: ${value}`)
    .join('\n');
}

const PREVIEW_SECTION_TITLES: Record<string, string> = {
  CLASS: 'Core Traits',
  RACE: 'Traits',
  BACKGROUND: 'Benefits',
};

export interface RaceTrait {
  name?: string;
  desc?: string;
  type?: string | null;
  order?: number;
}

export interface BackgroundBenefit {
  name?: string;
  type?: string;
  desc?: string;
}

export function getRaceTraits(item: RuleItemResponse): RaceTrait[] {
  const traits = (item.normalized as { traits?: RaceTrait[] } | undefined)?.traits;
  if (!Array.isArray(traits)) return [];
  return [...traits].sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
}

const BENEFIT_TYPE_ORDER = [
  'abilityScore',
  'skillProficiency',
  'toolProficiency',
  'feat',
  'equipment',
];

export function getBackgroundBenefits(item: RuleItemResponse): BackgroundBenefit[] {
  const benefits = (item.normalized as { benefits?: BackgroundBenefit[] } | undefined)?.benefits;
  if (!Array.isArray(benefits)) return [];
  return [...benefits].sort((a, b) => {
    const ia = BENEFIT_TYPE_ORDER.indexOf(a.type ?? '');
    const ib = BENEFIT_TYPE_ORDER.indexOf(b.type ?? '');
    if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    return (a.type ?? '').localeCompare(b.type ?? '');
  });
}

/** The class's core-traits feature desc (the `|Label|Value|` table), when present. */
export function getClassCoreTraitsDesc(item: RuleItemResponse): string | null {
  const sourceKey = item.sourceKey ?? '';
  const features = (
    item.normalized as { features?: Array<{ key?: string; desc?: string }> } | undefined
  )?.features;
  if (!Array.isArray(features)) return null;
  const core =
    features.find((f) => f.key === `${sourceKey}_core-traits`) ??
    features.find((f) => (f.key ?? '').endsWith('_core-traits'));
  const desc = core?.desc;
  return typeof desc === 'string' && desc.trim() ? desc : null;
}

/** Written at ingestion time into `normalized.flavorDesc`; see open5e/flavor-descriptions.ts. */
export function getFlavorDesc(item: RuleItemResponse): string | null {
  const value = (item.normalized as { flavorDesc?: unknown } | undefined)?.flavorDesc;
  return typeof value === 'string' && value.trim() ? value : null;
}

/** Markdown summary built from `normalized` for pickers and cards (not the full detail). */
export function getPreviewFromNormalized(item: RuleItemResponse): {
  content: string;
  sectionTitle: string;
} {
  const norm = item.normalized;
  const sectionTitle = PREVIEW_SECTION_TITLES[item.kind] ?? 'Details';
  if (!norm || typeof norm !== 'object') return { content: '', sectionTitle };

  if (item.kind === 'CLASS') {
    const desc = getClassCoreTraitsDesc(item);
    if (desc) return { content: tableLikeToBullets(desc), sectionTitle };
  }

  if (item.kind === 'RACE') {
    const parts = getRaceTraits(item)
      .filter((t) => t.name || t.desc)
      .map((t) => {
        const name = typeof t.name === 'string' ? t.name : 'Trait';
        const desc = typeof t.desc === 'string' ? t.desc : '';
        return desc.trim() ? `### ${name}\n\n${desc.trim()}` : `### ${name}`;
      });
    if (parts.length > 0) return { content: parts.join('\n\n'), sectionTitle };
  }

  if (item.kind === 'BACKGROUND') {
    const parts = getBackgroundBenefits(item)
      .filter((b) => b.name || b.desc)
      .map((b) => {
        const name = b.name ?? b.type ?? 'Benefit';
        const desc = b.desc ?? '';
        return desc.trim() ? `### ${name}\n\n${desc.trim()}` : `### ${name}`;
      });
    if (parts.length > 0) return { content: parts.join('\n\n'), sectionTitle };
  }

  return { content: '', sectionTitle };
}
