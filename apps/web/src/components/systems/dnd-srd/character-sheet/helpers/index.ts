import type * as React from 'react';
import {
  getBonusClassSkillBudgetExemptKeys,
  getCommonLanguageItem,
  normalizeStandardLanguageNames,
  MAX_STANDARD_LANGUAGES_TOTAL,
  type CharacterFormData,
  type RuleItemResponse,
} from '@rpgforce-ai/shared';

export * from './equipment';

export function updateField<K extends keyof CharacterFormData>(
  data: CharacterFormData,
  onChange: (d: CharacterFormData) => void,
  key: K,
  value: CharacterFormData[K]
) {
  onChange({ ...data, [key]: value });
}

export function updateAttribute(
  data: CharacterFormData,
  onChange: (d: CharacterFormData) => void,
  attr: string,
  value: number
) {
  const prev = data.attributes?.[attr];
  const hasBackgroundBonuses =
    data.backgroundAbilityScoreIncrease != null &&
    Object.values(data.backgroundAbilityScoreIncrease).some((v) => (v ?? 0) > 0);
  onChange({
    ...data,
    attributes: { ...data.attributes, [attr]: value },
    ...(prev !== value && hasBackgroundBonuses ? { backgroundAbilityScoreIncrease: {} } : {}),
  });
}

export function getTextContent(node: React.ReactNode): string {
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (node == null) return '';
  if (Array.isArray(node)) return node.map(getTextContent).join('');
  if (typeof node === 'object' && node !== null && 'props' in node) {
    const n = node as { props?: { children?: React.ReactNode } };
    return getTextContent(n.props?.children ?? '');
  }
  return '';
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

/**
 * Toggles ONE class skill when the character has several class budgets.
 *
 * {@link updateClassSkillSelection} rewrites every key in the option list it is given, which is
 * right for a single budget but destructive here: the Bard's multiclass allowance offers every
 * skill, so passing its list would set the Wizard's picks back to false. The cap is enforced by the
 * caller (the row is disabled once that class's budget is full), so this only flips one key.
 */
export function toggleMulticlassClassSkill(
  data: CharacterFormData,
  onChange: (d: CharacterFormData) => void,
  skillKey: string,
  checked: boolean
) {
  const current = data.classSkillProficiencyKeys ?? [];
  const nextKeys = checked
    ? current.includes(skillKey)
      ? current
      : [...current, skillKey]
    : current.filter((k) => k !== skillKey);
  onChange({
    ...data,
    classSkillProficiencyKeys: nextKeys,
    skillProficiencies: { ...data.skillProficiencies, [skillKey]: checked },
  });
}

export function toggleStandardLanguageSelection(
  data: CharacterFormData,
  onChange: (d: CharacterFormData) => void,
  options: RuleItemResponse[],
  item: RuleItemResponse
): void {
  const name = item.name.trim();
  const commonItem = getCommonLanguageItem(options);
  const commonName = commonItem?.name.trim() ?? 'Common';
  if (name.toLowerCase() === commonName.toLowerCase()) return;

  let current = [...(data.standardLanguageNames ?? [])];
  const k = (s: string) => s.trim().toLowerCase();
  const has = current.some((n) => k(n) === k(name));
  if (has) {
    current = current.filter((n) => k(n) !== k(name));
  } else if (current.length < MAX_STANDARD_LANGUAGES_TOTAL) {
    current.push(name);
  }
  const next = normalizeStandardLanguageNames(current, options);
  onChange({ ...data, standardLanguageNames: next });
}

export function updateToolProficiencyChoices(
  data: CharacterFormData,
  onChange: (d: CharacterFormData) => void,
  valueStr: string,
  chosenNames: string[]
) {
  const next = { ...(data.toolProficiencyChoices ?? {}), [valueStr]: chosenNames };
  onChange({ ...data, toolProficiencyChoices: next });
}
