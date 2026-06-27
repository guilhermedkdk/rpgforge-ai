'use client';

import type { RuleItemResponse } from '@rpgforce-ai/shared';
import type { CharacterFormData } from '@/lib/dnd-srd/character-state';
import { THIEVES_CANT_DISPLAY_NAME } from '@/lib/dnd-srd/character-state';
import {
  getCommonLanguageItem,
  getKnownLanguageNamesExcept,
  stripToolItemPriceSuffix,
  normalizeStandardLanguageNames,
  getClassExpertiseSkillKeys,
  getExpertiseSelectionPrerequisiteMessage,
} from '../../helpers';
import { MAX_STANDARD_LANGUAGES_TOTAL } from '../../constants';
import { RequirementAlert, SelectionSection } from './feature-detail-primitives';
import { FeatureOptionRow } from './feature-selection-row';

const MAX_DEFT_EXPLORER_LANGUAGES = 2;
const langNorm = (s: string) => s.trim().toLowerCase();

type PickerBlockProps = {
  data: CharacterFormData;
  onChange: (d: CharacterFormData) => void;
  skillsList: Array<{ key: string; name: string; abilityKey: string }>;
  standardLanguageOptions: RuleItemResponse[];
  variant: 'embedded' | 'footer';
};

export function DeftExplorerExpertisePickerBlock({
  data,
  onChange,
  skillsList,
}: Pick<PickerBlockProps, 'data' | 'onChange' | 'skillsList' | 'variant'>) {
  const proficientMap = data.skillProficiencies ?? {};
  const classOnlyExpertiseKeys = getClassExpertiseSkillKeys(data);
  const trainedSkills = skillsList.filter((s) => proficientMap[s.key] === true);
  const skillKeyToName = new Map(skillsList.map((s) => [s.key, s.name]));
  const getSkillName = (key: string) =>
    skillKeyToName.get(key) ?? key.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const deftExpertKey = data.deftExplorerExpertiseSkillKey ?? null;
  const deftExpertisePrereqMessage = getExpertiseSelectionPrerequisiteMessage(data, skillsList, {
    forDeftExplorer: true,
  });
  const deftExpertiseSheetReady = deftExpertisePrereqMessage == null;

  return (
    <SelectionSection>
      {!deftExpertiseSheetReady ? (
        <RequirementAlert reasons={deftExpertisePrereqMessage ? [deftExpertisePrereqMessage] : []} />
      ) : trainedSkills.length === 0 ? (
        <RequirementAlert
          detail={
            <ul className="mt-1 list-disc pl-4 text-destructive/90">
              <li>
                No proficient skills are listed yet. Use the{' '}
                <span className="font-medium">Skills</span> section to finish any remaining choices,
                then pick Deft Explorer Expertise.
              </li>
            </ul>
          }
        />
      ) : (
        <div
          className="max-h-64 space-y-2 overflow-y-auto pb-2 pr-1"
          role="list"
          aria-label="Deft Explorer expertise skill"
        >
          {trainedSkills.map((skill) => {
            const key = skill.key;
            const name = getSkillName(key);
            const isDeftPick = deftExpertKey === key;
            const alreadyExpertFromClass = classOnlyExpertiseKeys.includes(key);
            const showExpertiseMarker = isDeftPick || alreadyExpertFromClass;
            // Single choice: once a skill is picked, the others lock — deselect to switch (same
            // standard as the other selectors). Class-expert skills stay locked regardless.
            const disabled =
              (alreadyExpertFromClass && !isDeftPick) || (deftExpertKey != null && !isDeftPick);
            return (
              <FeatureOptionRow
                key={key}
                selected={showExpertiseMarker}
                disabled={disabled}
                mark="e"
                onClick={() => {
                  if (disabled) return;
                  onChange({
                    ...data,
                    deftExplorerExpertiseSkillKey: isDeftPick ? null : key,
                  });
                }}
              >
                <span className="truncate text-xs font-medium text-foreground">{name}</span>
              </FeatureOptionRow>
            );
          })}
        </div>
      )}
    </SelectionSection>
  );
}

export function DeftExplorerLanguagesPickerBlock({
  data,
  onChange,
  standardLanguageOptions,
}: PickerBlockProps) {
  const normalizedStandard = normalizeStandardLanguageNames(
    data.standardLanguageNames,
    standardLanguageOptions,
  );
  const standardLanguagesComplete = normalizedStandard.length >= MAX_STANDARD_LANGUAGES_TOTAL;
  const knownElsewhere = getKnownLanguageNamesExcept(data, 'deftExplorer', standardLanguageOptions);
  const commonItem = getCommonLanguageItem(standardLanguageOptions);
  const restSorted = [...standardLanguageOptions]
    .filter((o) => o.id !== commonItem?.id)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  const orderedLangOptions = commonItem ? [commonItem, ...restSorted] : restSorted;

  return (
    <SelectionSection>
      {orderedLangOptions.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No standard languages are available in this compendium.
        </p>
      ) : !standardLanguagesComplete ? (
        <RequirementAlert
          detail={
            <ul className="mt-1 list-disc pl-4 text-destructive/90">
              <li>
                Choose your standard languages in{' '}
                <span className="font-medium">Languages &amp; Proficiencies</span> before selecting
                Deft Explorer languages here.
              </li>
            </ul>
          }
        />
      ) : (
        <div
          className="max-h-64 space-y-2 overflow-y-auto pb-2 pr-1"
          role="list"
          aria-label="Deft Explorer languages"
        >
          {orderedLangOptions.map((item) => {
            const displayName = stripToolItemPriceSuffix(item.name);
            const isCommon = commonItem != null && item.id === commonItem.id;
            const selectedNames = data.deftExplorerLanguageNames ?? [];
            const selected = selectedNames.some((n) => langNorm(n) === langNorm(item.name));
            const canSelectMore = selectedNames.length < MAX_DEFT_EXPLORER_LANGUAGES;
            const isKnownElsewhere = knownElsewhere.has(langNorm(item.name));
            const disabled = !selected && (!canSelectMore || isCommon || isKnownElsewhere);
            return (
              <FeatureOptionRow
                key={item.id}
                selected={selected || isKnownElsewhere || isCommon}
                disabled={disabled}
                mark="check"
                onClick={() => {
                  if (disabled) return;
                  if (selected) {
                    onChange({
                      ...data,
                      deftExplorerLanguageNames: selectedNames.filter(
                        (n) => langNorm(n) !== langNorm(item.name),
                      ),
                    });
                  } else {
                    onChange({
                      ...data,
                      deftExplorerLanguageNames: [...selectedNames, item.name.trim()],
                    });
                  }
                }}
              >
                <span className="truncate text-xs font-medium text-foreground">{displayName}</span>
              </FeatureOptionRow>
            );
          })}
        </div>
      )}
    </SelectionSection>
  );
}

export function ThievesCantLanguagePickerBlock({
  data,
  onChange,
  standardLanguageOptions,
}: Pick<PickerBlockProps, 'data' | 'onChange' | 'standardLanguageOptions' | 'variant'>) {
  const normalizedStandard = normalizeStandardLanguageNames(
    data.standardLanguageNames,
    standardLanguageOptions,
  );
  const standardLanguagesComplete = normalizedStandard.length >= MAX_STANDARD_LANGUAGES_TOTAL;
  const knownElsewhere = getKnownLanguageNamesExcept(data, 'thievesCant', standardLanguageOptions);
  const commonItem = getCommonLanguageItem(standardLanguageOptions);
  const restSorted = [...standardLanguageOptions]
    .filter((o) => o.id !== commonItem?.id)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  const orderedLangOptions = commonItem ? [commonItem, ...restSorted] : restSorted;
  const extraRaw = data.thievesCantExtraLanguageName ?? null;
  const extraTrimmed =
    extraRaw != null && String(extraRaw).trim() !== '' ? String(extraRaw).trim() : null;

  return (
    <SelectionSection>
      {orderedLangOptions.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No standard languages are available in this compendium.
        </p>
      ) : !standardLanguagesComplete ? (
        <RequirementAlert
          detail={
            <ul className="mt-1 list-disc pl-4 text-destructive/90">
              <li>
                Choose your standard languages in{' '}
                <span className="font-medium">Languages &amp; Proficiencies</span> before selecting
                your additional language for {THIEVES_CANT_DISPLAY_NAME} here.
              </li>
            </ul>
          }
        />
      ) : (
        <div
          className="max-h-64 space-y-2 overflow-y-auto pb-2 pr-1"
          role="list"
          aria-label={`Additional language for ${THIEVES_CANT_DISPLAY_NAME}`}
        >
          {orderedLangOptions.map((item) => {
            const displayName = stripToolItemPriceSuffix(item.name);
            const isCommon = commonItem != null && item.id === commonItem.id;
            const selected =
              extraTrimmed != null && langNorm(extraTrimmed) === langNorm(item.name);
            const canSelectMore = extraTrimmed == null;
            const isKnownElsewhere = knownElsewhere.has(langNorm(item.name));
            const disabled = !selected && (!canSelectMore || isCommon || isKnownElsewhere);
            return (
              <FeatureOptionRow
                key={item.id}
                selected={selected || isKnownElsewhere || isCommon}
                disabled={disabled}
                mark="check"
                onClick={() => {
                  if (disabled) return;
                  if (selected) {
                    onChange({ ...data, thievesCantExtraLanguageName: null });
                  } else {
                    onChange({ ...data, thievesCantExtraLanguageName: item.name.trim() });
                  }
                }}
              >
                <span className="truncate text-xs font-medium text-foreground">{displayName}</span>
              </FeatureOptionRow>
            );
          })}
        </div>
      )}
    </SelectionSection>
  );
}
