import type { RuleItemResponse } from '@rpgforce-ai/shared';
import type { CharacterFormData } from '@/lib/dnd-srd/character-state';
import { isCharacterBackgroundSelected } from '@/lib/dnd-srd/character-state';

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
      if (!list) { list = []; byAbility.set(abilityKey, list); }
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

export function retainSkillProficiencyFromClassOrBackground(
  data: CharacterFormData,
  skillKey: string
): boolean {
  if ((data.backgroundSkillKeys ?? []).includes(skillKey)) return true;
  if ((data.classSkillProficiencyKeys ?? []).includes(skillKey)) return true;
  return false;
}

export function getBonusClassSkillBudgetExemptKeys(data: CharacterFormData): string[] {
  const keys: string[] = [];
  if (data.primalKnowledgeSkillKey) keys.push(data.primalKnowledgeSkillKey);
  const exemptTraitNames = new Set(['keen senses', 'skillful']);
  for (const [traitName, sel] of Object.entries(data.raceTraitSelections ?? {})) {
    if (!sel) continue;
    if (exemptTraitNames.has(traitName.trim().toLowerCase())) keys.push(sel);
  }
  return [...new Set(keys)];
}

export function getClassExpertiseSkillKeys(data: CharacterFormData): string[] {
  const merged = data.expertiseSkillKeys ?? [];
  const deft = data.deftExplorerExpertiseSkillKey ?? null;
  if (deft == null || deft === '') return [...merged];
  return merged.filter((k) => k !== deft);
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

  const classOptions = data.classSkillOptions ?? { keys: [], chooseN: null };
  const optionKeysRaw =
    classOptions.keys.length > 0 ? classOptions.keys : skillsList.map((s) => s.key);
  const optionKeys = [...new Set(optionKeysRaw)];
  if (optionKeys.length > 0) {
    const backgroundSkillKeys = data.backgroundSkillKeys ?? [];
    const budgetExemptKeys = getBonusClassSkillBudgetExemptKeys(data);
    const proficientMap = data.skillProficiencies ?? {};
    const chooseN = classOptions.chooseN ?? optionKeys.length;
    const selectedCount = optionKeys.filter(
      (k) => proficientMap[k] && !backgroundSkillKeys.includes(k) && !budgetExemptKeys.includes(k)
    ).length;
    if (selectedCount < chooseN)
      return `Complete all class skill choices in the Skills section ${closing}`;
  }

  return null;
}

export function updateClassSkillSelection(
  data: CharacterFormData,
  onChange: (d: CharacterFormData) => void,
  skillKey: string,
  checked: boolean,
  optionKeys: string[],
  chooseN: number | null,
  backgroundSkillKeys: string[]
) {
  const current = data.classSkillProficiencyKeys ?? [];
  const max = chooseN ?? optionKeys.length;
  let nextKeys: string[];
  if (checked) {
    if (current.includes(skillKey)) nextKeys = current;
    else if (current.length < max) nextKeys = [...current, skillKey];
    else nextKeys = current;
  } else {
    nextKeys = current.filter((k) => k !== skillKey);
  }
  const nextProficiencies = { ...data.skillProficiencies };
  for (const k of optionKeys) {
    if (backgroundSkillKeys.includes(k)) continue;
    nextProficiencies[k] = nextKeys.includes(k);
  }
  for (const k of getBonusClassSkillBudgetExemptKeys(data)) {
    if (optionKeys.includes(k)) nextProficiencies[k] = true;
  }
  onChange({ ...data, classSkillProficiencyKeys: nextKeys, skillProficiencies: nextProficiencies });
}
