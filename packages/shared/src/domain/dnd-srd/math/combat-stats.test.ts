import { describe, it, expect } from 'vitest';
import { recomputeCombatStats, type CombatStatsInput } from './combat-stats';

const die = (dieMax: number, levels: number) => [{ dieMax, levels }];

const base: CombatStatsInput = {
  level: 1,
  dexMod: 0,
  conMod: 0,
  hitDicePool: die(8, 1),
  hasClass: true,
};

describe('recomputeCombatStats', () => {
  it('level 1: maxHp = hitDieMax + conMod; base AC = 10 + Dex; initiative = Dex', () => {
    const r = recomputeCombatStats({ ...base, dexMod: 2, conMod: 1, hitDicePool: die(10, 1) });
    expect(r.maxHp).toBe(11); // d10 + con 1
    expect(r.baseArmorClass).toBe('12'); // 10 + Dex 2
    expect(r.initiative).toBe('2');
  });

  // The load path calls this BEFORE the derivation supplies the hit dice (they come from the class
  // rule item and are not persisted), so an un-computable maxHp must leave the stored currentHp
  // alone — clamping to 0 there destroyed it, and the next pass read the zero back as "previous".
  it('does not clamp currentHp while maxHp is not computable (no hit die yet)', () => {
    const noHitDie = recomputeCombatStats({
      ...base,
      level: 20,
      conMod: 2,
      hitDicePool: [],
      hasClass: false,
      previousCurrentHp: 77,
    });
    expect(noHitDie.maxHp).toBe(0);
    expect(noHitDie.currentHp).toBe(77);

    // Next pass, with the derived hit die: the value survives and is clamped against the real maxHp.
    const withHitDie = recomputeCombatStats({
      ...base,
      level: 20,
      conMod: 2,
      hitDicePool: die(6, 20),
      previousCurrentHp: noHitDie.currentHp,
    });
    expect(withHitDie.maxHp).toBe(122);
    expect(withHitDie.currentHp).toBe(77);
  });

  it('a brand-new character still starts at 0/0 (nothing stored to preserve)', () => {
    const blank = recomputeCombatStats({
      ...base,
      hitDicePool: [],
      hasClass: false,
      previousCurrentHp: 0,
    });
    expect(blank.maxHp).toBe(0);
    expect(blank.currentHp).toBe(0);
  });

  it('current HP defaults to max, and is clamped into [0, maxHp]', () => {
    const full = recomputeCombatStats({ ...base, hitDicePool: die(8, 1), conMod: 2 });
    expect(full.currentHp).toBe(full.maxHp); // 10
    const clamped = recomputeCombatStats({
      ...base,
      hitDicePool: die(8, 1),
      conMod: 2,
      previousCurrentHp: 999,
    });
    expect(clamped.currentHp).toBe(clamped.maxHp);
    const kept = recomputeCombatStats({
      ...base,
      hitDicePool: die(8, 1),
      conMod: 2,
      previousCurrentHp: 3,
    });
    expect(kept.currentHp).toBe(3);
    const floored = recomputeCombatStats({ ...base, previousCurrentHp: -5 });
    expect(floored.currentHp).toBe(0);
  });

  it('per-TOTAL-level HP features apply (Dwarven Toughness)', () => {
    // d8, con 2, level 3: base 10 + 2*(5+2)=24; +2/level → +6 = 30
    const r = recomputeCombatStats({
      ...base,
      level: 3,
      hitDicePool: die(8, 3),
      conMod: 2,
      bonusHpPerLevel: 2,
    });
    expect(r.maxHp).toBe(30);
  });

  it('Alert adds the proficiency bonus to initiative', () => {
    // level 5 → PB +3; Dex +2 → initiative 5
    const r = recomputeCombatStats({ ...base, level: 5, dexMod: 2, hasAlert: true });
    expect(r.initiative).toBe('5');
    const without = recomputeCombatStats({ ...base, level: 5, dexMod: 2 });
    expect(without.initiative).toBe('2');
  });

  it('no class yet → base AC is empty', () => {
    const r = recomputeCombatStats({ ...base, dexMod: 3, hasClass: false, hitDicePool: [] });
    expect(r.baseArmorClass).toBe('');
    expect(r.maxHp).toBe(0); // no hit die
  });

  // SRD 5.2: "You gain the level 1 Hit Points for a class only when your total character level is 1."
  describe('multiclass hit points', () => {
    it('only the INITIAL class gets the level 1 max die', () => {
      // Fighter 5 (d10) then Wizard 5 (d6), con +2.
      // Fighter: 10+2 (level 1) + 4*(6+2)=32 → 44. Wizard: 5*(4+2)=30. Total 74.
      const r = recomputeCombatStats({
        ...base,
        level: 10,
        conMod: 2,
        hitDicePool: [
          { dieMax: 10, levels: 5 },
          { dieMax: 6, levels: 5 },
        ],
      });
      expect(r.maxHp).toBe(74);
    });

    it('the order of the classes changes the total (the initial class rolls the max die)', () => {
      const fighterFirst = recomputeCombatStats({
        ...base,
        level: 2,
        conMod: 0,
        hitDicePool: [
          { dieMax: 10, levels: 1 },
          { dieMax: 6, levels: 1 },
        ],
      });
      // Fighter 10 + Wizard average 4 = 14
      expect(fighterFirst.maxHp).toBe(14);

      const wizardFirst = recomputeCombatStats({
        ...base,
        level: 2,
        conMod: 0,
        hitDicePool: [
          { dieMax: 6, levels: 1 },
          { dieMax: 10, levels: 1 },
        ],
      });
      // Wizard 6 + Fighter average 6 = 12
      expect(wizardFirst.maxHp).toBe(12);
    });

    it('a per-class HP feature counts only that class levels (Draconic Resilience)', () => {
      // Sorcerer 3 (d6) / Fighter 5 (d10), con 0. Draconic Resilience is +1 per SORCERER level.
      // Sorcerer: 6 + 2*4 = 14. Fighter: 5*6 = 30. Base 44, +3 (not +8) = 47.
      const r = recomputeCombatStats({
        ...base,
        level: 8,
        conMod: 0,
        hitDicePool: [
          { dieMax: 6, levels: 3 },
          { dieMax: 10, levels: 5 },
        ],
        bonusHpPerClassLevel: [{ classIndex: 0, perLevel: 1 }],
      });
      expect(r.maxHp).toBe(47);
    });

    it('single-class results are unchanged by the pool refactor', () => {
      // Cleric 20, con +3: 8+3 + 19*(5+3) = 163
      const r = recomputeCombatStats({
        ...base,
        level: 20,
        conMod: 3,
        hitDicePool: die(8, 20),
      });
      expect(r.maxHp).toBe(163);
    });
  });
});
