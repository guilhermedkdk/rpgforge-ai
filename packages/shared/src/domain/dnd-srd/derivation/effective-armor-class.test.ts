import { describe, it, expect } from 'vitest';
import { createDefaultCharacterData } from '../character/character-factory';
import { computeEffectiveArmorClass } from './effective-armor-class';
import type { CharacterFormData } from '../character/character-form-data';
import type { RuleItemResponse } from '../../../types/ruleitem';

// The persisted `combat.armorClass` is only the unarmored 10 + Dex base, so every consumer of the
// "real" AC (sheet header, sheets list) has to run this. Numbers below are the real SRD rows and
// match the live sheets: Fighter 17 (Chain Mail + Defense), Sorcerer 16 (Draconic Resilience),
// Cleric 14 (Chain Shirt + Shield at Dex -1).

function armorItem(
  id: string,
  name: string,
  armor: Record<string, unknown>,
  tagKeys: string[] = [],
): RuleItemResponse {
  return {
    id,
    packId: 'pack',
    kind: 'ITEM',
    source: 'test',
    sourceKey: id,
    name,
    normalized: { armor },
    raw: {},
    tagKeys,
    createdAt: '',
    updatedAt: '',
  };
}

const CHAIN_MAIL = armorItem('chain-mail', 'Chain Mail', {
  acBase: 16,
  category: 'heavy',
  acAddDexmod: false,
  acCapDexmod: null,
  strengthScoreRequired: 13,
});

const CHAIN_SHIRT = armorItem('chain-shirt', 'Chain Shirt', {
  acBase: 13,
  category: 'medium',
  acAddDexmod: true,
  acCapDexmod: 2,
  strengthScoreRequired: null,
});

const SHIELD = armorItem('shield', 'Shield', {
  acBase: 2,
  category: 'heavy',
  acAddDexmod: false,
  acCapDexmod: null,
  strengthScoreRequired: null,
});

const ARMORS = [CHAIN_MAIL, CHAIN_SHIRT, SHIELD];

const ALL_ARMOR_TRAINING = 'Armor Training: Light armor, Medium armor, Heavy armor, Shields';

function character(overrides: Partial<CharacterFormData> = {}): CharacterFormData {
  return {
    ...createDefaultCharacterData(),
    level: 20,
    attributes: {
      Strength: 16,
      Dexterity: 10,
      Constitution: 14,
      Intelligence: 10,
      Wisdom: 10,
      Charisma: 10,
    },
    proficiencies: ALL_ARMOR_TRAINING,
    ...overrides,
  };
}

const ac = (data: CharacterFormData, feats: RuleItemResponse[] = []): number =>
  computeEffectiveArmorClass({
    data,
    featureDetails: data.featureDetails ?? [],
    feats,
    armors: ARMORS,
  });

describe('computeEffectiveArmorClass', () => {
  it('falls back to 10 + Dex with no armor and no features', () => {
    expect(ac(character({ attributes: { Dexterity: 14 } }))).toBe(12);
  });

  it('uses the equipped armor AC instead of the stored base', () => {
    // The stored base (a stale 13) must NOT win over equipped Chain Mail.
    expect(ac(character({ armorClass: '13', equippedArmorId: 'chain-mail' }))).toBe(16);
  });

  it('adds a proficient shield on top of armor', () => {
    expect(
      ac(character({ equippedArmorId: 'chain-mail', equippedShieldId: 'shield' })),
    ).toBe(18);
  });

  it('caps the Dex bonus of medium armor and accepts a negative Dex mod (Cleric: 13 - 1 + 2)', () => {
    expect(
      ac(
        character({
          attributes: { Strength: 12, Dexterity: 8, Constitution: 14 },
          equippedArmorId: 'chain-shirt',
          equippedShieldId: 'shield',
        }),
      ),
    ).toBe(14);
  });

  it('ignores armor the character is not trained in', () => {
    expect(
      ac(character({ proficiencies: 'Armor Training: Light armor', equippedArmorId: 'chain-mail' })),
    ).toBe(10);
  });

  it('ignores armor whose Strength requirement is not met', () => {
    expect(
      ac(character({ attributes: { Strength: 8, Dexterity: 10 }, equippedArmorId: 'chain-mail' })),
    ).toBe(10);
  });

  it('applies Draconic Resilience unarmored: 10 + Dex + Cha (Sorcerer 16)', () => {
    expect(
      ac(
        character({
          attributes: { Dexterity: 12, Charisma: 20 },
          featureDetails: [{ name: 'Draconic Resilience', desc: '', source: 'subclass' }],
        }),
      ),
    ).toBe(16);
  });

  it('does not apply Draconic Resilience while wearing armor', () => {
    expect(
      ac(
        character({
          attributes: { Strength: 16, Dexterity: 12, Charisma: 20 },
          equippedArmorId: 'chain-mail',
          featureDetails: [{ name: 'Draconic Resilience', desc: '', source: 'subclass' }],
        }),
      ),
    ).toBe(16);
  });

  it('applies Unarmored Defense with Constitution (Barbarian)', () => {
    expect(
      ac(
        character({
          attributes: { Dexterity: 14, Constitution: 16 },
          featureDetails: [
            { name: 'Unarmored Defense', desc: 'While you are not wearing armor', source: 'class' },
          ],
        }),
      ),
    ).toBe(15);
  });

  it('drops the Barbarian Unarmored Defense when a shield is wielded', () => {
    expect(
      ac(
        character({
          attributes: { Dexterity: 14, Constitution: 16 },
          equippedShieldId: 'shield',
          featureDetails: [
            {
              name: 'Unarmored Defense',
              desc: 'While you are not wearing armor and not wielding a Shield',
              source: 'class',
            },
          ],
        }),
      ),
    ).toBe(14); // 10 + Dex(+2) + shield(+2), no Constitution
  });

  it('uses Wisdom for Unarmored Defense when the feature says so (Monk)', () => {
    expect(
      ac(
        character({
          attributes: { Dexterity: 14, Constitution: 10, Wisdom: 18 },
          featureDetails: [
            {
              name: 'Unarmored Defense',
              desc: 'your AC equals 10 plus your Dexterity and Wisdom modifiers',
              source: 'class',
            },
          ],
        }),
      ),
    ).toBe(16);
  });
});
