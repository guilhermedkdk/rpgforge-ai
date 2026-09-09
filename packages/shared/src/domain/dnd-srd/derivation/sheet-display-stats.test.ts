import { describe, it, expect } from 'vitest';
import { createDefaultCharacterData } from '../character/character-factory';
import type { CharacterFormData, FeatureDetail } from '../character/character-form-data';
import {
  computeDisplaySpeed,
  computeSavingThrowRows,
  computeSkillRows,
} from './sheet-display-stats';

// These rows are rendered twice: by the sheet's Saves/Skills section and by the PDF export. The
// point of pinning them here is that neither can drift from the other, since both call this file.

const sheet = (overrides: Partial<CharacterFormData> = {}): CharacterFormData => ({
  ...createDefaultCharacterData(),
  level: 12,
  attributes: {
    Strength: 20,
    Dexterity: 13,
    Constitution: 12,
    Intelligence: 10,
    Wisdom: 10,
    Charisma: 16,
  },
  ...overrides,
});

const feature = (name: string, overrides: Partial<FeatureDetail> = {}): FeatureDetail =>
  ({ name, desc: '', source: 'class', ...overrides }) as FeatureDetail;

const skills = [
  { key: 'athletics', name: 'Athletics', abilityKey: 'str' },
  { key: 'stealth', name: 'Stealth', abilityKey: 'dex' },
  { key: 'perception', name: 'Perception', abilityKey: 'wis' },
];

describe('computeSavingThrowRows', () => {
  it('adds the proficiency bonus only to the proficient saves', () => {
    const rows = computeSavingThrowRows({
      data: sheet({ savingThrows: { Wisdom: true, Charisma: true } }),
      featureDetails: [],
      proficiencyBonus: 4,
    });

    expect(rows.find((r) => r.attribute === 'Charisma')).toMatchObject({
      proficient: true,
      modifier: 7,
    });
    expect(rows.find((r) => r.attribute === 'Dexterity')).toMatchObject({
      proficient: false,
      modifier: 1,
    });
  });

  it('adds Aura of Protection (Charisma modifier, minimum +1) to every save', () => {
    const rows = computeSavingThrowRows({
      data: sheet({ savingThrows: { Charisma: true } }),
      featureDetails: [feature('Aura of Protection')],
      proficiencyBonus: 4,
    });

    // Dexterity +1 base + 3 aura; Charisma +3 base + 4 proficiency + 3 aura.
    expect(rows.find((r) => r.attribute === 'Dexterity')?.modifier).toBe(4);
    expect(rows.find((r) => r.attribute === 'Charisma')?.modifier).toBe(10);
  });

  it('adds half the proficiency bonus on a Jack of All Trades save that is not proficient', () => {
    const rows = computeSavingThrowRows({
      data: sheet({ savingThrows: { Dexterity: true } }),
      featureDetails: [feature('Jack of All Trades')],
      proficiencyBonus: 5,
    });

    // Wisdom +0 base, not proficient: floor(5 / 2). Dexterity is proficient, so it gets the full 5.
    expect(rows.find((r) => r.attribute === 'Wisdom')?.modifier).toBe(2);
    expect(rows.find((r) => r.attribute === 'Dexterity')?.modifier).toBe(6);
  });

  it('leaves every save at its ability modifier below level 1', () => {
    const rows = computeSavingThrowRows({
      data: sheet({ savingThrows: { Charisma: true } }),
      featureDetails: [],
      proficiencyBonus: null,
    });

    expect(rows.find((r) => r.attribute === 'Charisma')?.modifier).toBe(3);
  });
});

describe('computeSkillRows', () => {
  it('doubles the proficiency bonus on an Expertise skill', () => {
    const rows = computeSkillRows({
      data: sheet({
        skillProficiencies: { athletics: true, stealth: true },
        expertiseSkillKeysByClass: { 'class-1': ['athletics'] },
      }),
      proficiencyBonus: 4,
      skillsList: skills,
    });

    expect(rows.find((r) => r.key === 'athletics')).toMatchObject({
      expertise: true,
      modifier: 13,
    });
    expect(rows.find((r) => r.key === 'stealth')).toMatchObject({
      expertise: false,
      modifier: 5,
    });
    expect(rows.find((r) => r.key === 'perception')?.modifier).toBe(0);
  });
});

describe('computeDisplaySpeed', () => {
  const walking = { data: sheet({ speed: '30' }), armors: [] };

  it('keeps the base speed with no movement feature', () => {
    expect(computeDisplaySpeed({ ...walking, featureDetails: [] })).toBe(30);
  });

  it('adds Fast Movement and Unarmored Movement while unarmored', () => {
    const speed = computeDisplaySpeed({
      ...walking,
      featureDetails: [
        feature('Fast Movement'),
        feature('Unarmored Movement', {
          tableData: [
            {
              label: 'Unarmored Movement',
              rows: [
                { level: 2, value: '+10 ft.' },
                { level: 10, value: '+20 ft.' },
              ],
            },
          ],
        }),
      ],
    });

    // 30 base + 10 Fast Movement + the level 10 row of the Unarmored Movement table.
    expect(speed).toBe(60);
  });

  it('drops Fast Movement in heavy armor', () => {
    const chainMail = {
      id: 'armor-1',
      name: 'Chain Mail',
      normalized: { armor: { category: 'Heavy Armor' } },
    } as never;

    const speed = computeDisplaySpeed({
      data: sheet({ speed: '30', equippedArmorId: 'armor-1' }),
      featureDetails: [feature('Fast Movement')],
      armors: [chainMail],
    });

    expect(speed).toBe(30);
  });
});
