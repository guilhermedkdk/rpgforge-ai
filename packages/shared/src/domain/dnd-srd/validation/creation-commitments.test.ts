import { describe, it, expect } from 'vitest';
import type { RuleItemResponse } from '../../../types/ruleitem';
import { createDefaultCharacterData } from '../character/character-factory';
import type { CharacterFormData } from '../character/character-form-data';
import { isBaseAbilityAllocationComplete } from '../derivation/ability-progression';
import { areStandardLanguagesComplete } from '../proficiencies/languages';
import {
  getClassSkillBudgets,
  getExpertiseSelectionPrerequisiteMessage,
  isClassSkillSelectionComplete,
} from '../proficiencies/skills';
import { getPendingToolProficiencyChoices } from '../proficiencies/tool-proficiencies';

// The predicates behind the saved sheet's play-mode locks: a COMMITTED creation allocation renders
// read-only, an incomplete one stays editable so it can still be finished (level 3 subclass, a sheet
// that predates a rule). They are also what the save validation reports on, so a lock and its error
// message can never disagree.

const languageItem = (name: string): RuleItemResponse =>
  ({ id: name.toLowerCase(), name, tagKeys: [] }) as unknown as RuleItemResponse;

const STANDARD_LANGUAGES = ['Common', 'Elvish', 'Dwarvish', 'Giant'].map(languageItem);

const withBackground = (patch: Partial<CharacterFormData> = {}): CharacterFormData => ({
  ...createDefaultCharacterData(),
  backgroundRuleItemId: 'bg-1',
  background: 'Soldier',
  ...patch,
});

describe('isBaseAbilityAllocationComplete', () => {
  it('is false for a fresh character (standard array unassigned)', () => {
    expect(isBaseAbilityAllocationComplete(withBackground())).toBe(false);
  });

  it('is true once the standard array is fully assigned', () => {
    const data = withBackground({
      attributes: {
        Strength: 15,
        Dexterity: 14,
        Constitution: 13,
        Intelligence: 12,
        Wisdom: 10,
        Charisma: 8,
      },
    });
    expect(isBaseAbilityAllocationComplete(data)).toBe(true);
  });

  it('stays false while background bonus points are unspent', () => {
    const data = withBackground({
      attributes: {
        Strength: 15,
        Dexterity: 14,
        Constitution: 13,
        Intelligence: 12,
        Wisdom: 10,
        Charisma: 8,
      },
      backgroundAbilityScoreOption: { allowedAbilityNames: ['Strength'], totalPoints: 3 },
      backgroundAbilityScoreIncrease: { Strength: 1 },
    });
    expect(isBaseAbilityAllocationComplete(data)).toBe(false);
    expect(
      isBaseAbilityAllocationComplete({
        ...data,
        backgroundAbilityScoreIncrease: { Strength: 3 },
      }),
    ).toBe(true);
  });
});

describe('isClassSkillSelectionComplete', () => {
  const skillsList = [{ key: 'athletics' }, { key: 'insight' }, { key: 'stealth' }];

  it('is true when there is no class yet (nothing to commit)', () => {
    expect(isClassSkillSelectionComplete(createDefaultCharacterData(), skillsList)).toBe(true);
  });

  it('counts only picks from the class list that the background did not grant', () => {
    const data = withBackground({
      classRuleItemId: 'class-1',
      className: 'Fighter',
      classSkillOptions: { keys: ['athletics', 'insight', 'stealth'], chooseN: 2 },
      backgroundSkillKeys: ['insight'],
      skillProficiencies: { insight: true, athletics: true },
    });
    expect(isClassSkillSelectionComplete(data, skillsList)).toBe(false);
    expect(
      isClassSkillSelectionComplete(
        { ...data, skillProficiencies: { insight: true, athletics: true, stealth: true } },
        skillsList,
      ),
    ).toBe(true);
  });

  it('caps the target at the still-pickable pool, so a small list can never read as incomplete', () => {
    const data = withBackground({
      classRuleItemId: 'class-1',
      className: 'Fighter',
      // 2 picks required but the background already granted 2 of the 3 options.
      classSkillOptions: { keys: ['athletics', 'insight', 'stealth'], chooseN: 2 },
      backgroundSkillKeys: ['insight', 'stealth'],
      skillProficiencies: { insight: true, stealth: true, athletics: true },
    });
    expect(isClassSkillSelectionComplete(data, skillsList)).toBe(true);
  });
});

describe('areStandardLanguagesComplete', () => {
  it('treats an unloaded catalog as complete (the check only ever loosens)', () => {
    expect(areStandardLanguagesComplete(createDefaultCharacterData(), [])).toBe(true);
  });

  it('requires the full target from the catalog', () => {
    const data = { ...createDefaultCharacterData(), standardLanguageNames: ['Common', 'Elvish'] };
    expect(areStandardLanguagesComplete(data, STANDARD_LANGUAGES)).toBe(false);
    expect(
      areStandardLanguagesComplete(
        { ...data, standardLanguageNames: ['Common', 'Elvish', 'Giant'] },
        STANDARD_LANGUAGES,
      ),
    ).toBe(true);
  });

  it('caps the target at what the pack offers', () => {
    const data = { ...createDefaultCharacterData(), standardLanguageNames: ['Common'] };
    expect(areStandardLanguagesComplete(data, [languageItem('Common')])).toBe(true);
  });
});

describe('getPendingToolProficiencyChoices', () => {
  const proficiencies = 'Tool Proficiencies: Choose 2 artisan tools\nWeapon Proficiencies: Simple';

  it('reports an unfilled "Choose N" slot with its progress', () => {
    const pending = getPendingToolProficiencyChoices({
      ...createDefaultCharacterData(),
      proficiencies,
      toolProficiencyChoices: { 'Choose 2 artisan tools': ["Smith's Tools"] },
    });
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ chooseN: 2, chosen: 1 });
  });

  it('is empty once the slot is filled', () => {
    const pending = getPendingToolProficiencyChoices({
      ...createDefaultCharacterData(),
      proficiencies,
      toolProficiencyChoices: { 'Choose 2 artisan tools': ["Smith's Tools", "Mason's Tools"] },
    });
    expect(pending).toEqual([]);
  });

  it('ignores non-tool proficiency lines', () => {
    expect(
      getPendingToolProficiencyChoices({
        ...createDefaultCharacterData(),
        proficiencies: 'Weapon Proficiencies: Choose 2 martial weapons',
      }),
    ).toEqual([]);
  });
});

// A multiclass class brings its OWN "choose N skills" allowance from its OWN list. Reading the
// single flat `classSkillOptions` only ever saw the initial class, so the Bard's extra pick was
// derived and then silently dropped: the sheet counted as complete without it.
describe('multiclass class-skill budgets', () => {
  const skillsList = [
    { key: 'arcana' },
    { key: 'history' },
    { key: 'stealth' },
    { key: 'persuasion' },
  ];
  const wizardBard = (skillProficiencies: Record<string, boolean>) =>
    withBackground({
      classRuleItemId: 'wizard',
      className: 'Wizard',
      classes: [
        { classRuleItemId: 'wizard', className: 'Wizard', subclassRuleItemId: null, subclass: '', level: 1 },
        { classRuleItemId: 'bard', className: 'Bard', subclassRuleItemId: null, subclass: '', level: 1 },
      ],
      classSkillOptions: { keys: ['arcana', 'history'], chooseN: 2 },
      classSkillOptionsByClass: {
        wizard: { keys: ['arcana', 'history'], chooseN: 2 },
        // Bard's multiclass grant: one skill of ANY kind.
        bard: { keys: [], chooseN: 1 },
      },
      skillProficiencies,
    });

  it('still owes the Bard pick after both Wizard skills are taken', () => {
    const budgets = getClassSkillBudgets(wizardBard({ arcana: true, history: true }), skillsList);
    expect(budgets.map((b) => `${b.className} ${b.selectedKeys.length}/${b.chooseN}`)).toEqual([
      'Wizard 2/2',
      'Bard 0/1',
    ]);
    expect(isClassSkillSelectionComplete(wizardBard({ arcana: true, history: true }), skillsList)).toBe(
      false,
    );
  });

  it('is complete once the Bard pick is placed too', () => {
    const data = wizardBard({ arcana: true, history: true, stealth: true });
    expect(getClassSkillBudgets(data, skillsList).map((b) => b.selectedKeys)).toEqual([
      ['arcana', 'history'],
      ['stealth'],
    ]);
    expect(isClassSkillSelectionComplete(data, skillsList)).toBe(true);
  });

  // The narrow list is filled first, so an "any skill" allowance cannot swallow a pick that only
  // the Wizard list could have justified and leave the Wizard budget looking short.
  it('fills the most restrictive budget first', () => {
    const budgets = getClassSkillBudgets(
      wizardBard({ arcana: true, stealth: true }),
      skillsList,
    );
    expect(budgets[0].selectedKeys).toEqual(['arcana']);
    expect(budgets[1].selectedKeys).toEqual(['stealth']);
  });
});

// Features that gate on "finish your class skills first" (Primal Knowledge, Expertise, Skilled)
// had their OWN copy of the counting, which only ever saw the initial class. A Bard dip therefore
// unlocked them while its extra skill was still owed.
describe('class-skill prerequisite gate honours every class budget', () => {
  const skillsList = [
    { key: 'arcana', name: 'Arcana' },
    { key: 'history', name: 'History' },
    { key: 'stealth', name: 'Stealth' },
  ];
  const sheet = (skillProficiencies: Record<string, boolean>) =>
    withBackground({
      classRuleItemId: 'wizard',
      className: 'Wizard',
      classes: [
        { classRuleItemId: 'wizard', className: 'Wizard', subclassRuleItemId: null, subclass: '', level: 1 },
        { classRuleItemId: 'bard', className: 'Bard', subclassRuleItemId: null, subclass: '', level: 1 },
      ],
      classSkillOptions: { keys: ['arcana', 'history'], chooseN: 2 },
      classSkillOptionsByClass: {
        wizard: { keys: ['arcana', 'history'], chooseN: 2 },
        bard: { keys: [], chooseN: 1 },
      },
      skillProficiencies,
    });

  it('stays blocked while the Bard skill is missing', () => {
    expect(
      getExpertiseSelectionPrerequisiteMessage(sheet({ arcana: true, history: true }), skillsList),
    ).toMatch(/Complete all class skill choices/);
  });

  it('unlocks once every budget is filled', () => {
    expect(
      getExpertiseSelectionPrerequisiteMessage(
        sheet({ arcana: true, history: true, stealth: true }),
        skillsList,
      ),
    ).toBeNull();
  });
});
