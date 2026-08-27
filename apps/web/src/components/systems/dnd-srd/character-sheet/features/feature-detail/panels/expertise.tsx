'use client';

import { getExpertiseMaxForFeature, getExpertisePicks, getExpertisePicksFromOtherClasses, getExpertiseSelectionPrerequisiteMessage, setExpertisePicks, type CharacterFormData } from '@rpgforce-ai/shared';
import { RequirementAlert, SelectionSection } from '../shared/selection';
import { FeatureOptionRow } from '../shared/feature-option-row';
import { getSkillNameFromList } from '../shared/skill-name';
import type { FeatureDetail } from '../shared/types';

interface ExpertisePanelProps {
  feat: FeatureDetail;
  data: CharacterFormData;
  onChange: (d: CharacterFormData) => void;
  skillsList: Array<{ key: string; name: string; abilityKey: string }>;
}

export function ExpertisePanel({ feat, data, onChange, skillsList }: ExpertisePanelProps) {
  // Scoped to THIS class's instance: a Bard 9 / Rogue 6 fills 4 here and 4 in the other panel.
  const maxSelections = getExpertiseMaxForFeature(feat);
  const proficientMap = data.skillProficiencies ?? {};
  const deftExpertKey = data.deftExplorerExpertiseSkillKey ?? null;
  const classExpertiseKeys = getExpertisePicks(data, feat);
  const otherClassKeys = getExpertisePicksFromOtherClasses(data, feat);
  const trainedSkills = skillsList.filter((s) => proficientMap[s.key] === true);
  const canSelectMore = classExpertiseKeys.length < maxSelections;

  const expertisePrereqMessage = getExpertiseSelectionPrerequisiteMessage(data, skillsList);
  const expertiseSheetReady = expertisePrereqMessage == null;

  return (
    <SelectionSection>
      {!expertiseSheetReady ? (
        <RequirementAlert reasons={expertisePrereqMessage ? [expertisePrereqMessage] : []} />
      ) : trainedSkills.length === 0 ? (
        <RequirementAlert
          detail={
            <ul className="mt-1 list-disc pl-4 text-destructive/90">
              <li>
                No proficient skills are listed yet. Use the{' '}
                <span className="font-medium">Skills</span> section to finish any remaining choices,
                or check species and background proficiencies.
              </li>
            </ul>
          }
        />
      ) : (
        <div className="max-h-64 space-y-2 overflow-y-auto pb-2 pr-1">
          {trainedSkills.map((skill) => {
            const key = skill.key;
            const name = getSkillNameFromList(key, skillsList);
            const isClassPick = classExpertiseKeys.includes(key);
            // Another class already doubled it, or Deft Explorer did: shown checked and locked, so
            // the same skill is never paid for twice and it is clear where it came from.
            const lockedFromElsewhere =
              otherClassKeys.includes(key) ||
              (deftExpertKey != null && deftExpertKey !== '' && deftExpertKey === key);
            const showExpertiseMarker = isClassPick || lockedFromElsewhere;
            const disabled = lockedFromElsewhere || (!isClassPick && !canSelectMore);
            return (
              <FeatureOptionRow
                key={key}
                selected={showExpertiseMarker}
                disabled={disabled}
                mark="e"
                onClick={() => {
                  if (disabled) return;
                  let nextClass: string[];
                  if (isClassPick) {
                    nextClass = classExpertiseKeys.filter((k) => k !== key);
                  } else {
                    if (classExpertiseKeys.length >= maxSelections) return;
                    nextClass = [...classExpertiseKeys, key];
                  }
                  onChange({ ...data, ...setExpertisePicks(data, feat, nextClass) });
                }}
              >
                <span className="text-xs font-medium text-foreground">{name}</span>
              </FeatureOptionRow>
            );
          })}
        </div>
      )}
    </SelectionSection>
  );
}
