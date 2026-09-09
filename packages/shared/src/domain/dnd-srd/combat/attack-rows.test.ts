import { describe, it, expect } from 'vitest';
import { createDefaultCharacterData } from '../character/character-factory';
import type { CharacterFormData, FeatureDetail } from '../character/character-form-data';
import type { RuleItemResponse } from '../../../types/ruleitem';
import { computeAttackRows } from './attack-rows';

// The same rows feed the sheet's Attacks section and the PDF export, so what is pinned here is
// what a printed sheet shows.

const weapon = (
  name: string,
  tagKeys: string[],
  normalized: Record<string, unknown>
): RuleItemResponse => ({ id: name.toLowerCase(), name, tagKeys, normalized }) as RuleItemResponse;

const LONGSWORD = weapon('Longsword', ['weapon:type:martial'], { damage: '1d8' });
const DAGGER = weapon('Dagger', ['weapon:type:simple', 'weapon:property:finesse'], {
  damage: '1d4',
});
const SHORTBOW = weapon('Shortbow', ['weapon:type:simple', 'weapon:property:ammunition'], {
  damage: '1d6',
});
// The pack ships Unarmed Strike as an item of its own, with a flat damage of 1.
const UNARMED = weapon('Unarmed Strike', [], { damage: '1' });

const sheet = (overrides: Partial<CharacterFormData> = {}): CharacterFormData => ({
  ...createDefaultCharacterData(),
  level: 5,
  attributes: {
    Strength: 18,
    Dexterity: 14,
    Constitution: 14,
    Intelligence: 10,
    Wisdom: 12,
    Charisma: 8,
  },
  proficiencies: 'Weapon Proficiencies: Simple and Martial weapons',
  equipment: 'Longsword\nDagger\nShortbow',
  ...overrides,
});

const rowsOf = (data: CharacterFormData, proficiencyBonus: number | null = 3) =>
  computeAttackRows({
    data,
    weapons: [UNARMED, LONGSWORD, DAGGER, SHORTBOW],
    feats: [],
    proficiencyBonus,
  });

describe('computeAttackRows', () => {
  it('always lists Unarmed Strike, which is proficient at any level', () => {
    const rows = rowsOf(sheet({ equipment: '' }));

    expect(rows).toHaveLength(1);
    // Strength +4 plus the proficiency bonus; the SRD unarmed damage is 1 + the modifier.
    expect(rows[0]).toMatchObject({ weaponName: 'Unarmed Strike', toHit: '+7', damage: '1 + 4' });
  });

  it('uses Strength for a melee weapon and the best of Str/Dex for a finesse one', () => {
    const rows = rowsOf(sheet({ attributes: { ...sheet().attributes, Dexterity: 20 } }));

    expect(rows.find((r) => r.weaponName === 'Longsword')).toMatchObject({
      toHit: '+7',
      damage: '1d8 + 4',
    });
    // Dexterity 20 (+5) beats Strength 18 (+4) on a finesse weapon.
    expect(rows.find((r) => r.weaponName === 'Dagger')).toMatchObject({
      toHit: '+8',
      damage: '1d4 + 5',
    });
  });

  it('uses Dexterity for a weapon with the Ammunition property', () => {
    expect(rowsOf(sheet()).find((r) => r.weaponName === 'Shortbow')).toMatchObject({
      toHit: '+5',
      damage: '1d6 + 2',
    });
  });

  it('drops the proficiency bonus from a weapon the character is not proficient with', () => {
    const rows = rowsOf(sheet({ proficiencies: 'Weapon Proficiencies: Simple weapons' }));

    expect(rows.find((r) => r.weaponName === 'Longsword')).toMatchObject({
      proficient: false,
      toHit: '+4',
    });
    expect(rows.find((r) => r.weaponName === 'Dagger')?.proficient).toBe(true);
  });

  it('substitutes the Martial Arts die while unarmored, and stops in armor', () => {
    const martialArts: FeatureDetail = {
      name: 'Martial Arts',
      desc: '',
      source: 'class',
      tableData: [
        {
          label: 'Martial Arts Die',
          rows: [
            { level: 1, value: '1d6' },
            { level: 5, value: '1d8' },
          ],
        },
      ],
    } as FeatureDetail;

    const unarmored = rowsOf(sheet({ featureDetails: [martialArts] }));
    // The level 5 die (1d8) replaces the dagger's own 1d4; Unarmed Strike takes it too.
    expect(unarmored.find((r) => r.weaponName === 'Dagger')?.damage).toBe('1d8 + 4');
    expect(unarmored.find((r) => r.weaponName === 'Unarmed Strike')?.damage).toBe('1d8 + 4');
    // A martial weapon that is not Light is out of scope for Martial Arts.
    expect(unarmored.find((r) => r.weaponName === 'Longsword')?.damage).toBe('1d8 + 4');

    const armored = rowsOf(sheet({ featureDetails: [martialArts], equippedArmorId: 'armor-1' }));
    expect(armored.find((r) => r.weaponName === 'Dagger')?.damage).toBe('1d4 + 4');
  });

  it('shows the ability part and an em dash while the level is unknown', () => {
    const rows = rowsOf(sheet(), null);

    expect(rows.find((r) => r.weaponName === 'Longsword')?.toHit).toBe('+4 —');
  });
});
