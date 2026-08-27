import { describe, it, expect } from 'vitest';
import { createDefaultCharacterData } from '../character/character-factory';
import type { CharacterFormData, FeatureDetail } from '../character/character-form-data';
import { getCharacterSheetSaveValidationErrors } from '../validation/character-sheet-save-validation';
import { getFeatureChoiceState, type WeaponMasteryChoiceMeta } from './feature-choice-state';

// A skill-pick feature whose whole pool is already proficient from another source has nothing left to
// choose: every picker disables the taken rows, so demanding a pick makes the sheet unsavable.
// Both cases below are reachable with the real SRD 5.2 rows (Elf trait + Ranger/Barbarian skill lists).

const KEEN_SENSES_OPTIONS = [
  { key: 'insight', label: 'Insight' },
  { key: 'perception', label: 'Perception' },
  { key: 'survival', label: 'Survival' },
];

// Ranger: "Choose 3: Animal Handling, Athletics, Insight, Investigation, Nature, Perception, Stealth,
// or Survival" — an Elf Ranger can own every Keen Senses option through class skills alone.
const keenSenses = (): FeatureDetail => ({
  name: 'Keen Senses',
  desc: 'You have proficiency in the Insight, Perception, or Survival skill.',
  source: 'race',
  options: KEEN_SENSES_OPTIONS,
});

// Barbarian: "Choose 2: Animal Handling, Athletics, Intimidation, Nature, Perception, or Survival".
const BARBARIAN_SKILL_KEYS = [
  'animal-handling',
  'athletics',
  'intimidation',
  'nature',
  'perception',
  'survival',
];

const primalKnowledge = (): FeatureDetail => ({
  name: 'Primal Knowledge',
  desc: 'You gain proficiency in another skill of your choice from the skill list available to Barbarians at level 1.',
  source: 'class',
});

const NO_WEAPON_MASTERY: WeaponMasteryChoiceMeta = {
  hasWeaponMasteryFeature: false,
  maxSelections: 0,
  currentSelections: [],
};

const proficientIn = (...keys: string[]): Record<string, boolean> =>
  Object.fromEntries(keys.map((k) => [k, true]));

const choiceState = (f: FeatureDetail, data: CharacterFormData) =>
  getFeatureChoiceState(f, data, [f], NO_WEAPON_MASTERY, {
    skillsList: BARBARIAN_SKILL_KEYS.map((key) => ({ key })),
  });

describe('Keen Senses with every option already proficient', () => {
  it('is pending while one option is still free', () => {
    const data: CharacterFormData = {
      ...createDefaultCharacterData(),
      skillProficiencies: proficientIn('insight', 'perception'),
    };
    expect(choiceState(keenSenses(), data).selectedOptionLabel).toBeNull();
  });

  it('is satisfied once all three are granted elsewhere', () => {
    const data: CharacterFormData = {
      ...createDefaultCharacterData(),
      classSkillProficiencyKeys: ['insight', 'perception', 'survival'],
      skillProficiencies: proficientIn('insight', 'perception', 'survival'),
    };
    expect(choiceState(keenSenses(), data).selectedOptionLabel).not.toBeNull();
  });

  it('counts a background-granted skill as taken (same rule the picker disables rows with)', () => {
    const data: CharacterFormData = {
      ...createDefaultCharacterData(),
      backgroundSkillKeys: ['survival'],
      skillProficiencies: proficientIn('insight', 'perception'),
    };
    expect(choiceState(keenSenses(), data).selectedOptionLabel).not.toBeNull();
  });

  it('keeps the explicit pick as the label when one was made', () => {
    const data: CharacterFormData = {
      ...createDefaultCharacterData(),
      raceTraitSelections: { 'Keen Senses': 'perception' },
      skillProficiencies: proficientIn('perception'),
    };
    expect(choiceState(keenSenses(), data).selectedOptionLabel).toBe('Perception');
  });

  it('no longer blocks the save (the error it used to raise is gone)', () => {
    const data: CharacterFormData = {
      ...createDefaultCharacterData(),
      name: 'Aria',
      classSkillProficiencyKeys: ['insight', 'perception', 'survival'],
      skillProficiencies: proficientIn('insight', 'perception', 'survival'),
      featureDetails: [keenSenses()],
    };
    const errors = getCharacterSheetSaveValidationErrors(data, {
      standardLanguageOptions: [],
      skillsList: [],
      feats: [],
      classes: [],
      subclasses: [],
    });
    expect(errors).not.toContain('Conclua as escolhas em: “Keen Senses”.');
  });
});

describe('Primal Knowledge with the class skill list exhausted', () => {
  const withClassPool = (patch: Partial<CharacterFormData>): CharacterFormData => ({
    ...createDefaultCharacterData(),
    classSkillOptions: { keys: BARBARIAN_SKILL_KEYS, chooseN: 2 },
    ...patch,
  });

  it('is pending while the class list still has a free skill', () => {
    const data = withClassPool({
      skillProficiencies: proficientIn(...BARBARIAN_SKILL_KEYS.slice(1)),
    });
    expect(choiceState(primalKnowledge(), data).selectedOptionLabel).toBeNull();
  });

  it('is satisfied once the whole class list is proficient', () => {
    const data = withClassPool({ skillProficiencies: proficientIn(...BARBARIAN_SKILL_KEYS) });
    expect(choiceState(primalKnowledge(), data).selectedOptionLabel).not.toBeNull();
  });

  it('stays pending when the class list is unknown (picker falls back to every skill)', () => {
    const data: CharacterFormData = {
      ...createDefaultCharacterData(),
      skillProficiencies: proficientIn(...BARBARIAN_SKILL_KEYS),
    };
    expect(choiceState(primalKnowledge(), data).selectedOptionLabel).toBeNull();
  });
});
