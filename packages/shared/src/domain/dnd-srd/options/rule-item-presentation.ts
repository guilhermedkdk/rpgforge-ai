import type { RuleItemResponse } from '../../../types/ruleitem';
import { SUBCLASS_UNLOCK_LEVEL } from './character-options';
import { readClassMulticlassing } from '../../../schemas/class-multiclassing';

/** Label/value pairs read from `raw` for the picker preview (speed, size, proficiencies…). */
export function getDetailSnippets(item: RuleItemResponse): { label: string; value: string }[] {
  const raw = item.raw ?? {};
  const snippets: { label: string; value: string }[] = [];

  // CLASS shows hit dice in its own core-traits table; SUBCLASS inherits the class value in
  // Open5e's raw (redundant in the subclass preview).
  const hitDice = raw.hit_dice as string | undefined;
  if (hitDice && item.kind !== 'CLASS' && item.kind !== 'SUBCLASS') {
    snippets.push({ label: 'Hit Dice', value: hitDice });
  }

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

export interface PreviewSection {
  title: string;
  content: string;
}

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

/** What joining a class mid-career gives you, from `normalized.multiclassing`. */
export interface MulticlassSummary {
  /** e.g. "Charisma 13" or "Strength or Dexterity 13"; null when the pack has no data. */
  requirement: string | null;
  /** Short noun phrases, always starting with the Hit Point Die. */
  grants: string[];
}

/**
 * The class's "As a Multiclass Character" entry, phrased for display.
 *
 * One formatter for every surface (library detail, the class picker), so the library and the sheet
 * can never describe the same class differently.
 */
export function getMulticlassSummary(item: RuleItemResponse): MulticlassSummary | null {
  const mc = readClassMulticlassing(item.normalized);
  if (!mc) return null;

  const { mode, abilities } = mc.primaryAbilities;
  const requirement =
    abilities.length > 0 ? `${abilities.join(mode === 'any' ? ' or ' : ' and ')} 13` : null;

  // The Hit Point Die is granted by every class and is not in `grants`; state it first so the list
  // never reads as "this class gives you nothing".
  const grants = ['Hit Point Die'];
  const g = mc.grants;
  if (g.weaponProficiencies) grants.push(`Proficiency with ${g.weaponProficiencies}`);
  if (g.armorTraining) grants.push(`Training with ${g.armorTraining}`);
  if (g.skillChoice) {
    const from = g.skillChoice.from === 'any' ? 'of your choice' : "from this class's skill list";
    grants.push(
      `Proficiency in ${g.skillChoice.count === 1 ? 'one skill' : `${g.skillChoice.count} skills`} ${from}`,
    );
  }
  if (g.toolProficiencies) {
    const choose = g.toolProficiencies.match(/^Choose\s+\d+\s+(.+)$/i);
    grants.push(
      choose ? `Proficiency with one ${choose[1]} of your choice` : `Proficiency with ${g.toolProficiencies}`,
    );
  }
  return { requirement, grants };
}

/**
 * Preview sections built from `normalized` for the header pickers (not the full detail).
 * Each section renders under its own small uppercase label ("Description", "Features", …).
 */
export function getPreviewFromNormalized(item: RuleItemResponse): PreviewSection[] {
  const norm = item.normalized;
  if (!norm || typeof norm !== 'object') return [];

  const sections: PreviewSection[] = [];
  // CLASS/RACE/BACKGROUND carry the flavor text in `flavorDesc`; SUBCLASS in `desc`.
  const subclassDesc = (norm as { desc?: unknown }).desc;
  const description =
    getFlavorDesc(item) ??
    (item.kind === 'SUBCLASS' && typeof subclassDesc === 'string' && subclassDesc.trim()
      ? subclassDesc.trim()
      : null);
  if (description) sections.push({ title: 'Description', content: description });

  if (item.kind === 'CLASS') {
    const desc = getClassCoreTraitsDesc(item);
    if (desc) sections.push({ title: 'Core Traits', content: tableLikeToBullets(desc) });
  }

  if (item.kind === 'SUBCLASS') {
    const features = (
      norm as {
        features?: Array<{
          name?: string;
          featureType?: string;
          gainedAt?: Array<{ level?: number }>;
        }>;
      }
    ).features;
    const namesByLevel = new Map<number, string[]>();
    for (const f of features ?? []) {
      if ((f.featureType ?? '').toUpperCase() !== 'CLASS_LEVEL_FEATURE' || !f.name) continue;
      const levels = (f.gainedAt ?? [])
        .map((g) => Number(g?.level))
        .filter((n) => Number.isFinite(n) && n > 0);
      // Without structured gainedAt, assume the subclass unlock level (3).
      for (const level of levels.length > 0 ? levels : [SUBCLASS_UNLOCK_LEVEL]) {
        namesByLevel.set(level, [...(namesByLevel.get(level) ?? []), f.name]);
      }
    }
    if (namesByLevel.size > 0) {
      const rows = [...namesByLevel.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([level, names]) => `- **Level ${level}**: ${names.join(', ')}`);
      sections.push({ title: 'Features', content: rows.join('\n') });
    }
  }

  if (item.kind === 'RACE') {
    const parts = getRaceTraits(item)
      .filter((t) => t.name || t.desc)
      .map((t) => {
        const name = typeof t.name === 'string' ? t.name : 'Trait';
        const desc = typeof t.desc === 'string' ? t.desc : '';
        return desc.trim() ? `### ${name}\n\n${desc.trim()}` : `### ${name}`;
      });
    if (parts.length > 0) sections.push({ title: 'Traits', content: parts.join('\n\n') });
  }

  if (item.kind === 'BACKGROUND') {
    const parts = getBackgroundBenefits(item)
      .filter((b) => b.name || b.desc)
      .map((b) => {
        const name = b.name ?? b.type ?? 'Benefit';
        const desc = b.desc ?? '';
        return desc.trim() ? `### ${name}\n\n${desc.trim()}` : `### ${name}`;
      });
    if (parts.length > 0) sections.push({ title: 'Benefits', content: parts.join('\n\n') });
  }

  return sections;
}
