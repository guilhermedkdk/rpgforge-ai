'use client';

import type { CharacterFormData } from '@/lib/dnd-srd/character-state';
import {
  getPrimalChampionBodyAndMindBonusBlockedReasons,
  getPrimalChampionBodyAndMindBonusFlags,
} from '@/lib/dnd-srd/character-state';
import { getClassExpertiseSkillKeys, getExpertiseSelectionPrerequisiteMessage, retainSkillProficiencyFromClassOrBackground } from '../../helpers';
import { SkillChoiceFromListBlock } from './skill-choice-from-list-block';
import { LevelValueTable } from './level-value-table';
import { RequirementAlert, SelectionSection } from './feature-detail-primitives';
import { FeatureOptionRow } from './feature-selection-row';
import type { FeatureDetail } from './types';
import { SCHOLAR_ALLOWED_SKILL_KEYS } from './types';

function getSkillNameFromList(
  key: string,
  skillsList: Array<{ key: string; name: string; abilityKey: string }>,
) {
  const found = skillsList.find((s) => s.key === key);
  return found?.name ?? key.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

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

interface ExpertisePanelProps {
  feat: FeatureDetail;
  data: CharacterFormData;
  onChange: (d: CharacterFormData) => void;
  skillsList: Array<{ key: string; name: string; abilityKey: string }>;
}

export function ExpertisePanel({ feat, data, onChange, skillsList }: ExpertisePanelProps) {
  const gainCount = feat.gainCount ?? 1;
  const maxSelections = gainCount * 2;
  const proficientMap = data.skillProficiencies ?? {};
  const deftExpertKey = data.deftExplorerExpertiseSkillKey ?? null;
  const classExpertiseKeys = getClassExpertiseSkillKeys(data);
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
            const lockedFromDeft =
              deftExpertKey != null && deftExpertKey !== '' && deftExpertKey === key;
            const showExpertiseMarker = isClassPick || lockedFromDeft;
            const disabled = lockedFromDeft || (!isClassPick && !canSelectMore);
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
                  const nextMerged =
                    deftExpertKey != null &&
                    deftExpertKey !== '' &&
                    !nextClass.includes(deftExpertKey)
                      ? [...nextClass, deftExpertKey]
                      : nextClass;
                  onChange({
                    ...(data as unknown as Record<string, unknown>),
                    expertiseSkillKeys: nextMerged,
                  } as unknown as typeof data);
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

interface WeaponMasteryPanelProps {
  data: CharacterFormData;
  onChange: (d: CharacterFormData) => void;
  weaponMasteryMeta: {
    hasWeaponMasteryFeature: boolean;
    maxSelections: number;
    masteryWeapons: Array<{ id: string; name: string }>;
    currentSelections: string[];
  };
}

export function WeaponMasteryPanel({ data, onChange, weaponMasteryMeta }: WeaponMasteryPanelProps) {
  if (!weaponMasteryMeta.hasWeaponMasteryFeature || weaponMasteryMeta.masteryWeapons.length === 0)
    return null;
  return (
    <SkillChoiceFromListBlock
      selectionMode="multi"
      entries={weaponMasteryMeta.masteryWeapons.map((w) => ({ key: w.id, label: w.name }))}
      selectedIds={data.weaponMasteryWeaponIds ?? []}
      maxSelections={weaponMasteryMeta.maxSelections}
      onChangeIds={(ids) => onChange({ ...data, weaponMasteryWeaponIds: ids })}
    />
  );
}

// ── Generic level/value table (for features with tableData not handled by spellcasting) ──

interface GenericTableDataProps {
  tableData: Array<{ label: string; rows: Array<{ level: number; value: string }> }>;
}

export function GenericTableData({ tableData }: GenericTableDataProps) {
  if (tableData.length === 0) return null;
  return (
    <>
      {tableData.map((tbl, tblIdx) => (
        <LevelValueTable key={tblIdx} rows={tbl.rows} />
      ))}
    </>
  );
}

interface PrimalChampionWarningProps {
  data: CharacterFormData;
  feat: FeatureDetail;
}

export function PrimalChampionWarning({ data, feat }: PrimalChampionWarningProps) {
  const name = feat.name.trim().toLowerCase();
  const isPrimalChampion = name === 'primal champion';
  const isBodyAndMind = name === 'body and mind';
  if (!isPrimalChampion && !isBodyAndMind) return null;

  const { hasPrimalChampion, hasBodyAndMind } = getPrimalChampionBodyAndMindBonusFlags(data);
  const bonusesActive = isPrimalChampion ? hasPrimalChampion : hasBodyAndMind;
  if (bonusesActive) return null;

  const blockedReasons = getPrimalChampionBodyAndMindBonusBlockedReasons(data);
  return (
    <SelectionSection>
      <RequirementAlert
        className="mb-3"
        reasons={blockedReasons}
        fallbackText="Finish outstanding prerequisites on the character sheet."
      />
    </SelectionSection>
  );
}
