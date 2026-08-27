'use client';

import type { CharacterFormData } from '@rpgforce-ai/shared';
import { RequirementAlert, SelectionSection } from '../shared/selection';
import { FeatureOptionRow } from '../shared/feature-option-row';
import { getSkillNameFromList } from '../shared/skill-name';
import { SCHOLAR_ALLOWED_SKILL_KEYS } from '../shared/types';

interface ScholarPanelProps {
  data: CharacterFormData;
  onChange: (d: CharacterFormData) => void;
  skillsList: Array<{ key: string; name: string; abilityKey: string }>;
}

export function ScholarPanel({ data, onChange, skillsList }: ScholarPanelProps) {
  const proficientMap = data.skillProficiencies ?? {};
  const allowedSet = new Set<string>(SCHOLAR_ALLOWED_SKILL_KEYS);
  const scholarSkills = skillsList.filter(
    (s) => allowedSet.has(s.key) && proficientMap[s.key] === true,
  );
  const current = data.scholarExpertiseSkillKey ?? null;

  return (
    <SelectionSection>
      {scholarSkills.length === 0 ? (
        <RequirementAlert
          reasons={[
            'You must have proficiency in at least one of: Arcana, History, Investigation, Medicine, Nature, or Religion.',
          ]}
        />
      ) : (
        <div className="max-h-64 space-y-2 overflow-y-auto pb-2 pr-1">
          {scholarSkills.map((skill) => {
            const key = skill.key;
            const isSelected = current === key;
            const disabled = !isSelected && current !== null;
            return (
              <FeatureOptionRow
                key={key}
                selected={isSelected}
                disabled={disabled}
                mark="e"
                onClick={() => {
                  if (disabled) return;
                  onChange({ ...data, scholarExpertiseSkillKey: isSelected ? null : key });
                }}
              >
                <span className="text-xs font-medium text-foreground">
                  {getSkillNameFromList(key, skillsList)}
                </span>
              </FeatureOptionRow>
            );
          })}
        </div>
      )}
    </SelectionSection>
  );
}
