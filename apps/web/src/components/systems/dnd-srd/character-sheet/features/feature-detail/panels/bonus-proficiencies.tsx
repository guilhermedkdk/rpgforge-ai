'use client';

import { BONUS_PROFICIENCIES_SKILL_PICKS, getExpertiseSelectionPrerequisiteMessage, retainSkillProficiencyFromClassOrBackground, type CharacterFormData } from '@rpgforce-ai/shared';
import { SkillChoiceFromListBlock } from '../shared/skill-choice-list';
import { RequirementAlert, SelectionSection } from '../shared/selection';

/**
 * Bonus Proficiencies (College of Lore): proficiency in 3 skills of choice (any skill).
 * Same list/gate as Skillful, in multi mode: skills already proficient from another source appear
 * checked and locked, and don't consume the 3 choices.
 */
export function BonusProficienciesPanel({
  data,
  onChange,
  skillsList,
}: {
  data: CharacterFormData;
  onChange: (d: CharacterFormData) => void;
  skillsList: Array<{ key: string; name: string; abilityKey: string }>;
}) {
  const prereqMessage = getExpertiseSelectionPrerequisiteMessage(data, skillsList, {
    contextClosing: 'before choosing Bonus Proficiencies here.',
  });
  if (prereqMessage != null) {
    return (
      <SelectionSection>
        <RequirementAlert reasons={[prereqMessage]} />
      </SelectionSection>
    );
  }

  const picked = data.bonusProficienciesSkillKeys ?? [];
  const proficientMap = data.skillProficiencies ?? {};
  const lockedIds = skillsList
    .map((s) => s.key)
    .filter((key) => !picked.includes(key) && proficientMap[key] === true);

  return (
    <SkillChoiceFromListBlock
      selectionMode="multi"
      entries={skillsList.map((s) => ({ key: s.key, label: s.name }))}
      selectedIds={picked}
      lockedIds={lockedIds}
      maxSelections={BONUS_PROFICIENCIES_SKILL_PICKS}
      onChangeIds={(ids) => {
        const nextSkills = { ...(data.skillProficiencies ?? {}) };
        for (const key of picked) {
          if (!ids.includes(key)) {
            nextSkills[key] = retainSkillProficiencyFromClassOrBackground(data, key);
          }
        }
        for (const key of ids) nextSkills[key] = true;
        onChange({ ...data, bonusProficienciesSkillKeys: ids, skillProficiencies: nextSkills });
      }}
    />
  );
}
