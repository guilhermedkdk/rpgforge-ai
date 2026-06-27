import { describe, it, expect } from 'vitest';
import { calcModifier } from './ability';
import { proficiencyBonusForLevel } from './proficiency';
import { hitDieMaxFromNotation, maxHpForLevel } from './hit-points';

describe('calcModifier', () => {
  it('applies floor((score - 10) / 2)', () => {
    expect(calcModifier(10)).toBe(0);
    expect(calcModifier(11)).toBe(0);
    expect(calcModifier(12)).toBe(1);
    expect(calcModifier(8)).toBe(-1);
    expect(calcModifier(15)).toBe(2);
    expect(calcModifier(18)).toBe(4);
    expect(calcModifier(20)).toBe(5);
    expect(calcModifier(1)).toBe(-5);
    expect(calcModifier(0)).toBe(-5);
  });
});

describe('proficiencyBonusForLevel', () => {
  it('follows the SRD progression', () => {
    const expected: Record<number, number> = {
      1: 2, 4: 2, 5: 3, 8: 3, 9: 4, 12: 4, 13: 5, 16: 5, 17: 6, 20: 6,
    };
    for (const [level, bonus] of Object.entries(expected)) {
      expect(proficiencyBonusForLevel(Number(level))).toBe(bonus);
    }
  });

  it('clamps level to 1-20', () => {
    expect(proficiencyBonusForLevel(0)).toBe(2);
    expect(proficiencyBonusForLevel(-3)).toBe(2);
    expect(proficiencyBonusForLevel(25)).toBe(6);
    expect(proficiencyBonusForLevel(99)).toBe(6);
  });
});

describe('hitDieMaxFromNotation', () => {
  it('parses dice notation', () => {
    expect(hitDieMaxFromNotation('1d8')).toBe(8);
    expect(hitDieMaxFromNotation('1d12')).toBe(12);
    expect(hitDieMaxFromNotation('2d6')).toBe(6);
    expect(hitDieMaxFromNotation('1D10')).toBe(10);
    expect(hitDieMaxFromNotation(' 1 d 8 ')).toBe(8);
  });

  it('returns 0 for unparseable / empty input', () => {
    expect(hitDieMaxFromNotation('')).toBe(0);
    expect(hitDieMaxFromNotation('abc')).toBe(0);
    expect(hitDieMaxFromNotation(null)).toBe(0);
    expect(hitDieMaxFromNotation(undefined)).toBe(0);
  });
});

describe('maxHpForLevel', () => {
  it('computes level 1 as hitDieMax + conMod', () => {
    expect(maxHpForLevel({ hitDieMax: 12, conMod: 2, level: 1 })).toBe(14);
    expect(maxHpForLevel({ hitDieMax: 8, conMod: 1, level: 1 })).toBe(9);
    expect(maxHpForLevel({ hitDieMax: 6, conMod: 0, level: 1 })).toBe(6);
  });

  it('adds ceil((hitDieMax+1)/2) + conMod per level after the first', () => {
    // d8, con +1, level 5: 9 + 4 * (5 + 1) = 33
    expect(maxHpForLevel({ hitDieMax: 8, conMod: 1, level: 5 })).toBe(33);
    // d10, con +2, level 3: 12 + 2 * (6 + 2) = 28
    expect(maxHpForLevel({ hitDieMax: 10, conMod: 2, level: 3 })).toBe(28);
  });

  it('applies Dwarven Toughness (+1 per level)', () => {
    // d8, con +2, level 3: base 10 + 2*(5+2)=24; +3 = 27
    expect(maxHpForLevel({ hitDieMax: 8, conMod: 2, level: 3, dwarvenToughness: true })).toBe(27);
  });

  it('returns 0 base with no hit die, but Dwarven Toughness still adds level', () => {
    expect(maxHpForLevel({ hitDieMax: 0, conMod: 3, level: 5 })).toBe(0);
    expect(maxHpForLevel({ hitDieMax: 0, conMod: 3, level: 5, dwarvenToughness: true })).toBe(5);
  });

  it('clamps level to 1-20', () => {
    const at20 = maxHpForLevel({ hitDieMax: 8, conMod: 1, level: 20 });
    expect(maxHpForLevel({ hitDieMax: 8, conMod: 1, level: 25 })).toBe(at20);
  });
});
