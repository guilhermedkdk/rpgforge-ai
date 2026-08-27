'use client';

import { getExpertiseSelectionPrerequisiteMessage, retainSkillProficiencyFromClassOrBackground, type CharacterFormData } from '@rpgforce-ai/shared';
import { SkillChoiceFromListBlock } from '../shared/skill-choice-list';
import { RequirementAlert, SelectionSection } from '../shared/selection';
import { getSkillNameFromList } from '../shared/skill-name';

interface PrimalKnowledgePanelProps {
  data: CharacterFormData;
  onChange: (d: CharacterFormData) => void;
  skillsList: Array<{ key: string; name: string; abilityKey: string }>;
}

export function PrimalKnowledgePanel({ data, onChange, skillsList }: PrimalKnowledgePanelProps) {
  const primalKnowledgePrereqMessage = getExpertiseSelectionPrerequisiteMessage(data, skillsList, {
    contextClosing: 'before choosing Primal Knowledge here.',
  });
  if (primalKnowledgePrereqMessage != null) {
    return (
      <SelectionSection>
        <RequirementAlert reasons={[primalKnowledgePrereqMessage]} />
      </SelectionSection>
    );
  }

  const classOptions = data.classSkillOptions ?? { keys: [], chooseN: null };
  const optionKeys =
    classOptions.keys.length > 0 ? classOptions.keys : skillsList.map((s) => s.key);
  if (optionKeys.length === 0) return null;

  return (
    <SkillChoiceFromListBlock
      entries={optionKeys.map((key) => ({
        key,
        label: getSkillNameFromList(key, skillsList),
      }))}
      selectedKey={data.primalKnowledgeSkillKey ?? null}
      proficientMap={data.skillProficiencies ?? {}}
      backgroundSkillKeys={data.backgroundSkillKeys ?? []}
      onPick={(key) => {
        const prev = data.primalKnowledgeSkillKey ?? null;
        const nextSkills = { ...(data.skillProficiencies ?? {}) };
        if (key === null) {
          if (prev) {
            nextSkills[prev] = retainSkillProficiencyFromClassOrBackground(data, prev);
          }
          onChange({ ...data, primalKnowledgeSkillKey: null, skillProficiencies: nextSkills });
          return;
        }
        if (prev && prev !== key) {
          nextSkills[prev] = retainSkillProficiencyFromClassOrBackground(data, prev);
        }
        nextSkills[key] = true;
        onChange({ ...data, primalKnowledgeSkillKey: key, skillProficiencies: nextSkills });
      }}
    />
  );
}
