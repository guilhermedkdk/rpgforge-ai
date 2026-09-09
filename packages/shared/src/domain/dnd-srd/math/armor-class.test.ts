import { describe, it, expect } from 'vitest';
import { assembleArmorClass, type ArmorClassParams } from './armor-class';

const base: ArmorClassParams = {
  storedBaseAc: undefined,
  dexMod: 0,
  conMod: 0,
  wisMod: 0,
  chaMod: 0,
  armorAc: null,
  hasArmorEquipped: false,
  hasShieldEquipped: false,
  shieldBonusApplies: false,
  hasUnarmoredDefense: false,
  unarmoredDefenseUsesWis: false,
  unarmoredDefenseRequiresNoShield: false,
  hasDraconicResilience: false,
  defenseStyleApplies: false,
};

describe('assembleArmorClass', () => {
  it('no armor, no feature: 10 + Dex', () => {
    expect(assembleArmorClass({ ...base, dexMod: 3 })).toBe(13);
  });

  it('uses the equipped armor AC and ignores the unarmored base', () => {
    expect(assembleArmorClass({ ...base, dexMod: 3, armorAc: 16, hasArmorEquipped: true })).toBe(
      16
    );
  });

  it('Unarmored Defense with Constitution (Barbarian): 10 + Dex + Con', () => {
    expect(assembleArmorClass({ ...base, dexMod: 2, conMod: 3, hasUnarmoredDefense: true })).toBe(
      15
    );
  });

  it('Unarmored Defense with Wisdom (Monk): 10 + Dex + Wis', () => {
    expect(
      assembleArmorClass({
        ...base,
        dexMod: 2,
        conMod: 3,
        wisMod: 4,
        hasUnarmoredDefense: true,
        unarmoredDefenseUsesWis: true,
      })
    ).toBe(16);
  });

  it('Barbarian Unarmored Defense is disabled while a shield is equipped, falling back to 10 + Dex', () => {
    expect(
      assembleArmorClass({
        ...base,
        dexMod: 2,
        conMod: 3,
        hasUnarmoredDefense: true,
        unarmoredDefenseRequiresNoShield: true,
        hasShieldEquipped: true,
        shieldBonusApplies: true,
      })
    ).toBe(14); // 10 + Dex(2) + shield(2); no Con because the shield disables it
  });

  it('Draconic Resilience takes the best-of unarmored base (10 + Dex + Cha)', () => {
    expect(assembleArmorClass({ ...base, dexMod: 1, chaMod: 4, hasDraconicResilience: true })).toBe(
      15
    ); // max(10+1, 10+1+4)
  });

  it('proficient shield adds +2 on top of any base', () => {
    expect(
      assembleArmorClass({
        ...base,
        dexMod: 2,
        armorAc: 14,
        hasArmorEquipped: true,
        shieldBonusApplies: true,
      })
    ).toBe(16);
  });

  it('Defense fighting style adds +1', () => {
    expect(
      assembleArmorClass({
        ...base,
        armorAc: 15,
        hasArmorEquipped: true,
        defenseStyleApplies: true,
      })
    ).toBe(16);
  });

  it('prefers the stored base over 10 + Dex when it is higher (no armor)', () => {
    expect(assembleArmorClass({ ...base, storedBaseAc: 12, dexMod: 0 })).toBe(12);
  });

  it('clamps a negative/non-finite result to 0', () => {
    expect(assembleArmorClass({ ...base, storedBaseAc: undefined, dexMod: -20 })).toBe(0);
  });
});
