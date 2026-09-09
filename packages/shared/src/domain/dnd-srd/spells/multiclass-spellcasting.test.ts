import { describe, it, expect } from 'vitest';
import {
  computeMulticlassCasterLevel,
  getMulticlassSpellSlots,
  maxSlotLevelForCasterLevel,
  usesMulticlassSpellSlots,
  MULTICLASS_SPELL_SLOTS,
  type CasterLevelClass,
} from './multiclass-spellcasting';

const full = (level: number): CasterLevelClass => ({ casterType: 'FULL', level });
const half = (level: number): CasterLevelClass => ({ casterType: 'HALF', level });
const pact = (level: number): CasterLevelClass => ({ casterType: 'PACT', level });
const none = (level: number): CasterLevelClass => ({ casterType: 'NONE', level });

describe('computeMulticlassCasterLevel', () => {
  // The SRD's own worked example: "if you are a level 4 Ranger / level 3 Sorcerer, you count as a
  // level 5 character when determining your spell slots".
  it('matches the SRD example: Ranger 4 / Sorcerer 3 counts as caster level 5', () => {
    expect(computeMulticlassCasterLevel([half(4), full(3)])).toBe(5);
  });

  it('full casters contribute every level', () => {
    expect(computeMulticlassCasterLevel([full(5), full(5)])).toBe(10);
  });

  // SRD 5.2 rounds UP, unlike the 2014 rules; a single Paladin level is worth a full caster level.
  it('half casters round UP, per class', () => {
    expect(computeMulticlassCasterLevel([half(1), full(1)])).toBe(2);
    expect(computeMulticlassCasterLevel([half(3), full(1)])).toBe(3);
    expect(computeMulticlassCasterLevel([half(1), half(1), full(1)])).toBe(3);
  });

  it('Pact Magic and non-casters contribute nothing', () => {
    expect(computeMulticlassCasterLevel([pact(5), full(3)])).toBe(3);
    expect(computeMulticlassCasterLevel([none(11), full(2)])).toBe(2);
    expect(computeMulticlassCasterLevel([pact(20)])).toBe(0);
  });

  it('caps at 20', () => {
    expect(computeMulticlassCasterLevel([full(20), full(20)])).toBe(20);
  });
});

describe('MULTICLASS_SPELL_SLOTS', () => {
  it('covers levels 1-20 with 9 slot columns each', () => {
    expect(MULTICLASS_SPELL_SLOTS).toHaveLength(20);
    for (const row of MULTICLASS_SPELL_SLOTS) expect(row).toHaveLength(9);
  });

  // Pinned against the table ingested as `srd-2024_multiclassing_rule-8`.
  it('matches the SRD rows at the boundaries', () => {
    expect(MULTICLASS_SPELL_SLOTS[0]).toEqual([2, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(MULTICLASS_SPELL_SLOTS[4]).toEqual([4, 3, 2, 0, 0, 0, 0, 0, 0]);
    expect(MULTICLASS_SPELL_SLOTS[10]).toEqual([4, 3, 3, 3, 2, 1, 0, 0, 0]);
    expect(MULTICLASS_SPELL_SLOTS[16]).toEqual([4, 3, 3, 3, 2, 1, 1, 1, 1]);
    expect(MULTICLASS_SPELL_SLOTS[17]).toEqual([4, 3, 3, 3, 3, 1, 1, 1, 1]);
    expect(MULTICLASS_SPELL_SLOTS[18]).toEqual([4, 3, 3, 3, 3, 2, 1, 1, 1]);
    expect(MULTICLASS_SPELL_SLOTS[19]).toEqual([4, 3, 3, 3, 3, 2, 2, 1, 1]);
  });

  it('slot counts never decrease as the caster level rises', () => {
    for (let level = 1; level < 20; level += 1) {
      for (let slot = 0; slot < 9; slot += 1) {
        expect(MULTICLASS_SPELL_SLOTS[level][slot]).toBeGreaterThanOrEqual(
          MULTICLASS_SPELL_SLOTS[level - 1][slot]
        );
      }
    }
  });
});

describe('getMulticlassSpellSlots', () => {
  it('gives the SRD example its four/three/two slots', () => {
    expect(getMulticlassSpellSlots(5)).toEqual({ 1: 4, 2: 3, 3: 2 });
  });

  it('omits levels with no slots', () => {
    expect(getMulticlassSpellSlots(1)).toEqual({ 1: 2 });
  });

  it('returns nothing below caster level 1', () => {
    expect(getMulticlassSpellSlots(0)).toEqual({});
  });

  it('reports the highest reachable slot level', () => {
    expect(maxSlotLevelForCasterLevel(5)).toBe(3);
    expect(maxSlotLevelForCasterLevel(20)).toBe(9);
    expect(maxSlotLevelForCasterLevel(0)).toBe(0);
  });
});

describe('usesMulticlassSpellSlots', () => {
  // "If you multiclass but have the Spellcasting feature from only one class, follow the rules for
  // that class." A Fighter/Wizard therefore keeps the plain Wizard table.
  it('is false with a single Spellcasting class', () => {
    expect(usesMulticlassSpellSlots([none(1), full(1)])).toBe(false);
    expect(usesMulticlassSpellSlots([full(20)])).toBe(false);
  });

  it('is false when the second caster is a Warlock (Pact Magic is its own pool)', () => {
    expect(usesMulticlassSpellSlots([pact(3), full(5)])).toBe(false);
  });

  it('is true with two Spellcasting classes, including a half caster', () => {
    expect(usesMulticlassSpellSlots([half(4), full(3)])).toBe(true);
    expect(usesMulticlassSpellSlots([full(5), full(5)])).toBe(true);
  });
});

// --- prerequisite scores -------------------------------------------------------------------
// "A score of at least 13" is the score ON THE SHEET. Checking the raw creation array instead
// wrongly blocked a character whose background bonus or ASI already took the ability to 13.
describe('multiclass prerequisites use effective ability scores', () => {
  it('counts the background increase and ASI gains toward the 13', async () => {
    const { getCharacterAbilityScores } = await import('../derivation/ability-progression');
    const { createDefaultCharacterData } = await import('../character/character-factory');

    const data = {
      ...createDefaultCharacterData(),
      // Raw 12 would fail the prerequisite on its own.
      attributes: {
        Strength: 12,
        Dexterity: 10,
        Constitution: 10,
        Intelligence: 11,
        Wisdom: 10,
        Charisma: 10,
      },
      backgroundAbilityScoreIncrease: { Strength: 1 },
      abilityScoreImprovementByGain: [
        { kind: 'increase_scores' as const, byAbility: { Intelligence: 2 } },
      ],
    };

    const scores = getCharacterAbilityScores(data);
    expect(scores.Strength).toBe(13); // 12 + 1 background
    expect(scores.Intelligence).toBe(13); // 11 + 2 ASI
    expect(scores.Charisma).toBe(10); // untouched
  });
});
