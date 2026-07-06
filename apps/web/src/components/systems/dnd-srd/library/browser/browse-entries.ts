import type { RuleItemResponse } from '@rpgforce-ai/shared';
import { ruleItemSpellLevel } from '../../character-sheet/sections/spellcasting/spell-utils';
import {
  getBackgroundBenefits,
  getFlavorDesc,
  getRaceTraits,
} from '@/lib/dnd-srd/rule-item-presentation';
import { stripContentPreamble } from './browse-markdown';
import {
  ITEM_MAGIC_YES_TAG,
  ITEM_RARITY_TAG_PREFIX,
  normalizedString,
  plainTextSnippet,
  prettifyTagValue,
  tagValueForPrefix,
} from './browse-config';

export interface BrowseEntry {
  item: RuleItemResponse;
  chips: string[];
  snippet: string;
}

const CASTER_TYPE_LABELS: Record<string, string> = {
  FULL: 'Full Caster',
  HALF: 'Half Caster',
};

export const spellSchoolName = (item: RuleItemResponse): string | null => {
  const school = (item.normalized as { school?: { name?: string } } | undefined)?.school;
  return school?.name ?? null;
};

export const spellLevelLabel = (level: number): string =>
  level === 0 ? 'Cantrip' : `Level ${level}`;

export const classEntry = (item: RuleItemResponse): BrowseEntry => {
  const hitDice = normalizedString(item, 'hitDice');
  const casterType = normalizedString(item, 'casterType');
  const chips: string[] = [];
  if (hitDice) chips.push(`Hit Die ${hitDice.toLowerCase()}`);
  const casterLabel = casterType ? CASTER_TYPE_LABELS[casterType] : null;
  if (casterLabel) chips.push(casterLabel);

  return { item, chips, snippet: getFlavorDesc(item) ?? '' };
};

export const subclassEntry = (item: RuleItemResponse): BrowseEntry => {
  const parent = (item.normalized as { subclassOf?: { name?: string } } | undefined)?.subclassOf;
  const chips = parent?.name ? [`${parent.name} Subclass`] : ['Subclass'];
  return { item, chips, snippet: plainTextSnippet(normalizedString(item, 'desc')) };
};

export const speciesEntry = (item: RuleItemResponse): BrowseEntry => {
  const traits = getRaceTraits(item);
  const chips: string[] = [];
  const size = traits.find((t) => t.type === 'SIZE')?.desc;
  if (size) chips.push(size.split('(')[0].trim());
  const speed = traits.find((t) => t.type === 'SPEED')?.desc;
  if (speed) chips.push(speed.replace(/\bfeet\b/i, 'ft'));
  return { item, chips, snippet: getFlavorDesc(item) ?? '' };
};

export const backgroundEntry = (item: RuleItemResponse): BrowseEntry => {
  const benefits = getBackgroundBenefits(item);
  const byType = (type: string) => benefits.find((b) => b.type === type)?.desc?.trim();
  const chips: string[] = [];
  const feat = byType('feat');
  if (feat) chips.push(`Feat: ${feat}`);
  return { item, chips, snippet: getFlavorDesc(item) ?? '' };
};

export const featEntry = (item: RuleItemResponse): BrowseEntry => {
  const chips: string[] = [];
  const type = normalizedString(item, 'type');
  if (type) chips.push(type);
  const prerequisite = normalizedString(item, 'prerequisite');
  if (prerequisite) chips.push('Prerequisite');
  const benefits =
    (item.normalized as { benefits?: Array<{ desc?: string }> } | undefined)?.benefits ?? [];
  const snippet = plainTextSnippet(
    benefits
      .map((b) => b.desc)
      .filter(Boolean)
      .join(' ')
  );
  return { item, chips, snippet };
};

export const spellEntry = (item: RuleItemResponse): BrowseEntry => {
  const n = (item.normalized ?? {}) as Record<string, unknown>;
  const chips = [spellLevelLabel(ruleItemSpellLevel(item))];
  const school = spellSchoolName(item);
  if (school) chips.push(school);
  if (n.concentration) chips.push('Concentration');
  if (n.ritual) chips.push('Ritual');
  return { item, chips, snippet: plainTextSnippet(normalizedString(item, 'desc')) };
};

export const formatCost = (cost: string | null): string | null => {
  if (!cost) return null;
  const value = Number(cost);
  if (!Number.isFinite(value) || value === 0) return null;
  return `${value} GP`;
};

export const formatWeight = (weight: string | null): string | null => {
  if (!weight) return null;
  const value = Number(weight);
  if (!Number.isFinite(value) || value === 0) return null;
  return `${value} lb.`;
};

interface NormalizedItemWeapon {
  damageDice?: string;
  damageType?: { name?: string };
  properties?: Array<{
    detail?: string | null;
    property?: { name?: string; desc?: string; type?: string | null };
  }>;
  isSimple?: boolean;
  isMartial?: boolean;
}

interface NormalizedItemArmor {
  acDisplay?: string;
  category?: string;
  strengthScoreRequired?: number | null;
  grantsStealthDisadvantage?: boolean;
}

export const itemWeapon = (item: RuleItemResponse): NormalizedItemWeapon | null =>
  (item.normalized as { weapon?: NormalizedItemWeapon } | undefined)?.weapon ?? null;

export const itemArmor = (item: RuleItemResponse): NormalizedItemArmor | null =>
  (item.normalized as { armor?: NormalizedItemArmor } | undefined)?.armor ?? null;

const weaponSummary = (weapon: NormalizedItemWeapon): string => {
  const parts: string[] = [];
  if (weapon.damageDice) {
    parts.push([weapon.damageDice, weapon.damageType?.name].filter(Boolean).join(' '));
  }
  const properties = (weapon.properties ?? [])
    .map((p) => (p.detail ? `${p.property?.name} (${p.detail})` : p.property?.name))
    .filter(Boolean);
  if (properties.length > 0) parts.push(properties.join(', '));
  return parts.join(' · ');
};

const armorSummary = (armor: NormalizedItemArmor): string => {
  const parts: string[] = [];
  if (armor.acDisplay) parts.push(`AC ${armor.acDisplay}`);
  if (armor.strengthScoreRequired) parts.push(`Str ${armor.strengthScoreRequired}`);
  if (armor.grantsStealthDisadvantage) parts.push('Stealth Disadvantage');
  return parts.join(' · ');
};

export const equipmentEntry = (item: RuleItemResponse): BrowseEntry => {
  const chips: string[] = [];
  const categoryName = normalizedString(item, 'categoryName');
  if (categoryName) chips.push(categoryName);
  const rarity = tagValueForPrefix(item, ITEM_RARITY_TAG_PREFIX);
  if (item.tagKeys.includes(ITEM_MAGIC_YES_TAG)) {
    chips.push(rarity ? prettifyTagValue(rarity) : 'Magic');
  } else {
    const cost = formatCost(normalizedString(item, 'cost'));
    if (cost) chips.push(cost);
  }
  const weapon = itemWeapon(item);
  const armor = itemArmor(item);
  const snippet =
    plainTextSnippet(normalizedString(item, 'desc'), 160) ||
    (weapon ? weaponSummary(weapon) : '') ||
    (armor ? armorSummary(armor) : '');
  return { item, chips, snippet };
};

export const rulesetEntry = (item: RuleItemResponse, ruleCount: number): BrowseEntry => ({
  item,
  chips: [`${ruleCount} ${ruleCount === 1 ? 'rule' : 'rules'}`],
  snippet: plainTextSnippet(stripContentPreamble(item.contentMd ?? '')),
});

/** The class a subclass belongs to, matched by `subclassOf.key` against the class's own `key`. */
export const findParentClass = (
  subclass: RuleItemResponse,
  classes: RuleItemResponse[]
): RuleItemResponse | undefined => {
  const parentKey = (subclass.normalized as { subclassOf?: { key?: string } } | undefined)
    ?.subclassOf?.key;
  if (!parentKey) return undefined;
  return classes.find(
    (c) => ((c.normalized as { key?: string } | undefined)?.key ?? c.sourceKey) === parentKey
  );
};

/** The ruleset a rule belongs to, matched by the rule's slug prefix (`{rulesetSlug}_rule-N`). */
export const findParentRuleset = (
  rule: RuleItemResponse,
  rulesets: RuleItemResponse[]
): RuleItemResponse | undefined => {
  const parentSlug = rule.slug?.replace(/_rule-\d+$/, '');
  return parentSlug ? rulesets.find((rs) => rs.slug === parentSlug) : undefined;
};

/** Rules belong to the ruleset whose slug prefixes theirs (`{rulesetSlug}_rule-N`). */
export const rulesForRuleset = (
  ruleset: RuleItemResponse,
  rules: RuleItemResponse[]
): RuleItemResponse[] => {
  if (!ruleset.slug) return [];
  const prefix = `${ruleset.slug}_`;
  return rules
    .filter((r) => r.slug?.startsWith(prefix))
    .sort((a, b) => {
      const ia = Number(a.slug?.match(/_rule-(\d+)$/)?.[1] ?? 0);
      const ib = Number(b.slug?.match(/_rule-(\d+)$/)?.[1] ?? 0);
      return ia - ib;
    });
};
