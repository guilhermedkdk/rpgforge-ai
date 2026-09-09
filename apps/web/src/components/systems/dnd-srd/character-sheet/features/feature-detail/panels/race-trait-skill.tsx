'use client';

import {
  getExpertiseSelectionPrerequisiteMessage,
  retainSkillProficiencyFromClassOrBackground,
  type CharacterFormData,
} from '@rpgforce-ai/shared';
import { SkillChoiceFromListBlock } from '../shared/skill-choice-list';
import { RequirementAlert, SelectionSection } from '../shared/selection';
import { getSkillNameFromList } from '../shared/skill-name';
import type { FeatureDetail } from '../shared/types';

interface RaceTraitSkillPickerProps {
  feat: FeatureDetail;
  data: CharacterFormData;
  onChange: (d: CharacterFormData) => void;
  skillsList: Array<{ key: string; name: string; abilityKey: string }>;
  /**
   * When set, the same class / background / class-skill completion rules as Expertise apply.
   * Value is the sentence tail after "…Skills section " (e.g. `before choosing Keen Senses here.`).
   */
  prerequisiteClosingPhrase?: string;
}

export function RaceTraitSkillPicker({
  feat,
  data,
  onChange,
  skillsList,
  prerequisiteClosingPhrase,
}: RaceTraitSkillPickerProps) {
  const traitName = feat.name;
  const opts = feat.options ?? [];
  if (opts.length < 1) return null;

  const raceTraitPrereqMessage =
    prerequisiteClosingPhrase != null
      ? getExpertiseSelectionPrerequisiteMessage(data, skillsList, {
          contextClosing: prerequisiteClosingPhrase,
        })
      : null;
  if (prerequisiteClosingPhrase != null && raceTraitPrereqMessage != null) {
    return (
      <SelectionSection>
        <RequirementAlert reasons={[raceTraitPrereqMessage]} />
      </SelectionSection>
    );
  }

  return (
    <SkillChoiceFromListBlock
      entries={opts.map((o) => ({
        key: o.key,
        label: getSkillNameFromList(o.key, skillsList),
      }))}
      selectedKey={data.raceTraitSelections?.[traitName] ?? null}
      proficientMap={data.skillProficiencies ?? {}}
      backgroundSkillKeys={data.backgroundSkillKeys ?? []}
      onPick={(key) => {
        const prev = data.raceTraitSelections?.[traitName] ?? null;
        const nextSkills = { ...(data.skillProficiencies ?? {}) };
        if (key === null) {
          if (prev) {
            nextSkills[prev] = retainSkillProficiencyFromClassOrBackground(data, prev);
          }
          const nextRace = { ...(data.raceTraitSelections ?? {}) };
          delete nextRace[traitName];
          onChange({ ...data, raceTraitSelections: nextRace, skillProficiencies: nextSkills });
          return;
        }
        if (prev && prev !== key) {
          nextSkills[prev] = retainSkillProficiencyFromClassOrBackground(data, prev);
        }
        nextSkills[key] = true;
        onChange({
          ...data,
          raceTraitSelections: { ...(data.raceTraitSelections ?? {}), [traitName]: key },
          skillProficiencies: nextSkills,
        });
      }}
    />
  );
}
