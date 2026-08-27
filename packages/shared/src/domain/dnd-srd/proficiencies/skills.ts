/**
 * Skill helpers shared by the web editor and the backend save-time validation:
 * the ability→skills catalog + the class-skill-budget exemptions + expertise skill keys.
 */
import type { RuleItemResponse } from '../../../types/ruleitem';
import type { CharacterFormData } from '../character/character-form-data';
import { isCharacterBackgroundSelected } from '../derivation/ability-progression';
import { getAllExpertiseSkillKeys } from '../features/expertise';

/**
 * The 18 SRD skill keys.
 *
 * The catalog normally comes from the pack's ABILITY rows (`getSkillsFromAbilities`); this is the
 * fallback pool for a "choose any N skills" class, and the filter that keeps an ingestion typo out
 * of a pick (the pack ships Open5e's `in sight`, which nothing downstream recognises).
 */
export const ALL_SKILL_KEYS = [
  'acrobatics',
  'animal-handling',
  'arcana',
  'athletics',
  'deception',
  'history',
  'insight',
  'intimidation',
  'investigation',
  'medicine',
  'nature',
  'perception',
  'performance',
  'persuasion',
  'religion',
  'sleight-of-hand',
  'stealth',
  'survival',
] as const;

export function getSkillsFromAbilities(
  abilities: RuleItemResponse[]
): Array<{ key: string; name: string; abilityKey: string }> {
  const order: string[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
  const out: Array<{ key: string; name: string; abilityKey: string }> = [];
  const byAbility = new Map<string, Array<{ key: string; name: string }>>();
  for (const a of abilities) {
    const raw = (a.normalized ?? a.raw) as {
      key?: string;
      skills?: Array<{ key?: string; name?: string; ability?: string }>;
    };
    const abilityKey = (raw.key ?? '').toLowerCase();
    const skills = raw.skills ?? [];
    for (const s of skills) {
      const key = (s.key ?? '').toLowerCase().replace(/\s+/g, '-');
      const name = (s.name ?? key) as string;
      if (!key) continue;
      let list = byAbility.get(abilityKey);
      if (!list) {
        list = [];
        byAbility.set(abilityKey, list);
      }
      list.push({ key, name });
    }
  }
  for (const abilityKey of order) {
    const list = byAbility.get(abilityKey) ?? [];
    list.sort((a, b) => a.name.localeCompare(b.name));
    for (const s of list) out.push({ ...s, abilityKey });
  }
  return out;
}

export function getBonusClassSkillBudgetExemptKeys(data: CharacterFormData): string[] {
  const keys: string[] = [];
  if (data.primalKnowledgeSkillKey) keys.push(data.primalKnowledgeSkillKey);
  const exemptTraitNames = new Set(['keen senses', 'skillful']);
  for (const [traitName, sel] of Object.entries(data.raceTraitSelections ?? {})) {
    if (!sel) continue;
    if (exemptTraitNames.has(traitName.trim().toLowerCase())) keys.push(sel);
  }
  keys.push(...(data.bonusProficienciesSkillKeys ?? []));
  return [...new Set(keys)];
}

/** One class's "choose N skills" allowance, with the picks currently attributed to it. */
export interface ClassSkillBudget {
  classRuleItemId: string;
  className: string;
  /** Skills this class may choose from. Empty means any skill (Bard's multiclass grant). */
  optionKeys: string[];
  /** Picks required, already capped at what the pool can still offer. */
  chooseN: number;
  /** Picks attributed to this budget. */
  selectedKeys: string[];
}

/**
 * Per-class "choose N skills" allowances.
 *
 * Multiclassing gives each class its own budget from its own list (a Wizard 1 / Bard 1 owes 2 from
 * the Wizard list plus 1 from anywhere), and a single flat `{keys, chooseN}` cannot express that.
 * Class picks are not persisted — only the final skill set is — so the attribution is rebuilt here
 * by filling the MOST RESTRICTIVE budget first, which is what keeps an "any skill" allowance from
 * swallowing a pick that only the narrower list could have justified.
 */
export function getClassSkillBudgets(
  data: CharacterFormData,
  skillsList: Array<{ key: string }>
): ClassSkillBudget[] {
  const allKeys = skillsList.map((s) => s.key);
  const real = (data.classes ?? []).filter((c) => Boolean(c.classRuleItemId));
  // Fall back to the scalar mirrors when the array is missing, so a shape built without it (an
  // older payload, a hand-assembled object) still gets validated instead of silently skipping.
  const entries =
    real.length > 0
      ? real
      : data.classRuleItemId
        ? [
            {
              classRuleItemId: data.classRuleItemId,
              className: data.className ?? '',
              subclassRuleItemId: data.subclassRuleItemId ?? null,
              subclass: data.subclass ?? '',
              level: data.level ?? 1,
            },
          ]
        : [];
  const byClass = data.classSkillOptionsByClass ?? {};

  const raw = entries
    .map((entry) => {
      // Pre-multiclass data has no per-class map: fall back to the single flat allowance.
      const opts =
        byClass[entry.classRuleItemId] ??
        (entries.length === 1 ? data.classSkillOptions : undefined);
      if (!opts) return null;
      const optionKeys = [...new Set(opts.keys.length > 0 ? opts.keys : allKeys)];
      if (optionKeys.length === 0) return null;
      return {
        classRuleItemId: entry.classRuleItemId,
        className: entry.className,
        optionKeys,
        wanted: opts.chooseN ?? optionKeys.length,
      };
    })
    .filter((b): b is NonNullable<typeof b> => b !== null);

  const backgroundSkillKeys = data.backgroundSkillKeys ?? [];
  const exempt = getBonusClassSkillBudgetExemptKeys(data);
  const proficient = data.skillProficiencies ?? {};
  const unassigned = new Set(
    allKeys.filter(
      (k) => proficient[k] && !backgroundSkillKeys.includes(k) && !exempt.includes(k)
    )
  );

  const ordered = [...raw].sort((a, b) => a.optionKeys.length - b.optionKeys.length);
  const selectedByClass = new Map<string, string[]>();
  for (const budget of ordered) {
    const taken: string[] = [];
    for (const key of budget.optionKeys) {
      if (taken.length >= budget.wanted) break;
      if (!unassigned.has(key)) continue;
      unassigned.delete(key);
      taken.push(key);
    }
    selectedByClass.set(budget.classRuleItemId, taken);
  }

  // Back in class order, and each target capped at what its pool can still offer.
  return raw.map((budget) => {
    const pool = budget.optionKeys.filter((k) => !backgroundSkillKeys.includes(k)).length;
    return {
      classRuleItemId: budget.classRuleItemId,
      className: budget.className,
      optionKeys: budget.optionKeys,
      chooseN: Math.min(budget.wanted, pool),
      selectedKeys: selectedByClass.get(budget.classRuleItemId) ?? [],
    };
  });
}

/**
 * Whether every "choose N class skills" pick is placed. Single source for the save-time validation
 * and the play-mode lock. `skillsList` is the full skill catalog, used when the class has no explicit
 * option list. The target is capped at the still-pickable pool (class list minus what the background
 * already granted), so a pool smaller than the budget can never read as incomplete.
 */
export function isClassSkillSelectionComplete(
  data: CharacterFormData,
  skillsList: Array<{ key: string }>
): boolean {
  const hasClass = data.classRuleItemId != null || (data.className ?? '').trim().length > 0;
  if (!hasClass || !isCharacterBackgroundSelected(data)) return true;

  // Per class, so a multiclass allowance (Bard's extra skill) is required on its own instead of
  // being absorbed into the initial class's count.
  const budgets = getClassSkillBudgets(data, skillsList);
  if (budgets.length === 0) return true;
  return budgets.every((b) => b.selectedKeys.length >= b.chooseN);
}

/** Every skill doubled by a CLASS Expertise feature (Scholar and Deft Explorer are their own fields). */
export function getClassExpertiseSkillKeys(data: CharacterFormData): string[] {
  return getAllExpertiseSkillKeys(data);
}

/** Everything the sheet renders as expertise: the class picks plus Scholar and Deft Explorer. */
export function getEffectiveExpertiseSkillKeys(data: CharacterFormData): string[] {
  const extra = [data.scholarExpertiseSkillKey, data.deftExplorerExpertiseSkillKey].filter(
    (k): k is string => typeof k === 'string' && k.trim() !== ''
  );
  return [...new Set([...getAllExpertiseSkillKeys(data), ...extra])];
}

export function retainSkillProficiencyFromClassOrBackground(
  data: CharacterFormData,
  skillKey: string
): boolean {
  if ((data.backgroundSkillKeys ?? []).includes(skillKey)) return true;
  if ((data.classSkillProficiencyKeys ?? []).includes(skillKey)) return true;
  return false;
}

export type DeftExplorerDescSplit = {
  beforeExpertise: string;
  expertiseSection: string;
  languagesSection: string;
};

function matchEarliestIn(
  text: string,
  patterns: RegExp[]
): { index: number; length: number } | null {
  let best: { index: number; length: number } | null = null;
  for (const re of patterns) {
    const m = re.exec(text);
    if (m && typeof m.index === 'number') {
      const len = m[0].length;
      if (!best || m.index < best.index) best = { index: m.index, length: len };
    }
  }
  return best;
}

export function splitDeftExplorerDesc(desc: string): DeftExplorerDescSplit | null {
  const d = desc;
  if (!d.trim()) return null;

  const expertiseHeading = String.raw`\*\*Expertise(?:\.\*\*|\*\*\.?)`;
  const expertisePatterns = [
    new RegExp(`\\n${expertiseHeading}\\s*`),
    new RegExp(`^${expertiseHeading}\\s*`, 'm'),
    /\n#{1,3}\s*Expertise\b[^\n]*\n/,
  ];
  const e = matchEarliestIn(d, expertisePatterns);
  if (!e) return null;

  const afterExpertiseHeader = d.slice(e.index + e.length);
  const languagesHeading = String.raw`\*\*Languages?(?:\.\*\*|\*\*\.?)`;
  const languagePatterns = [
    new RegExp(`\\n${languagesHeading}\\s*`),
    new RegExp(`^${languagesHeading}\\s*`, 'm'),
    /\n#{1,3}\s*Languages?\b[^\n]*\n/,
  ];
  const l = matchEarliestIn(afterExpertiseHeader, languagePatterns);
  if (!l) return null;

  const langStartInFull = e.index + e.length + l.index;
  return {
    beforeExpertise: d.slice(0, e.index).trim(),
    expertiseSection: d.slice(e.index, langStartInFull).trim(),
    languagesSection: d.slice(langStartInFull).trim(),
  };
}

export function getExpertiseSelectionPrerequisiteMessage(
  data: CharacterFormData,
  skillsList: Array<{ key: string; name: string }>,
  options?: { forDeftExplorer?: boolean; contextClosing?: string }
): string | null {
  const closing =
    options?.contextClosing ??
    (options?.forDeftExplorer
      ? 'before selecting Deft Explorer Expertise here.'
      : 'before choosing Expertise here.');
  const hasClass = data.classRuleItemId != null || (data.className ?? '').trim().length > 0;

  if (!hasClass)
    return `Select your class first, then your background, then complete all class skill choices in the Skills section ${closing}`;
  if (!isCharacterBackgroundSelected(data))
    return `Select your background, then complete all class skill choices in the Skills section ${closing}`;

  // Same predicate the Skills section and the save validation use, so the gate cannot disagree with
  // them. It had its own copy of the counting, which only ever saw the initial class: a multiclass
  // allowance (the Bard's extra skill) was still owed and this still read as complete.
  if (!isClassSkillSelectionComplete(data, skillsList))
    return `Complete all class skill choices in the Skills section ${closing}`;

  return null;
}
