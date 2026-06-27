import { describe, it, expect } from 'vitest';
import {
  ABILITY_SCORE_CAP_FROM_ASI,
  abilityScoreCeilingForAsi,
  getEffectiveAttribute,
  getEffectiveModifier,
} from './attributes';

const attrs = (overrides: Record<string, number>) => ({
  Strength: 10,
  Dexterity: 10,
  Constitution: 10,
  Intelligence: 10,
  Wisdom: 10,
  Charisma: 10,
  ...overrides,
});

describe('getEffectiveAttribute', () => {
  it('returns 0 when the base score is not yet chosen', () => {
    expect(getEffectiveAttribute({ Strength: 0 }, undefined, 'Strength')).toBe(0);
  });

  it('adds background increase and Epic Boon (+1 to the chosen ability)', () => {
    expect(getEffectiveAttribute(attrs({ Strength: 15 }), { Strength: 2 }, 'Strength')).toBe(17);
    expect(
      getEffectiveAttribute(attrs({ Charisma: 17 }), undefined, 'Charisma', 'Charisma'),
    ).toBe(18);
  });

  it('applies Primal Champion (+4 Str/Con, cap 25) and Body and Mind (+4 Dex/Wis, cap 25)', () => {
    expect(getEffectiveAttribute(attrs({ Strength: 18 }), undefined, 'Strength', null, true, false)).toBe(22);
    // cap at 25
    expect(getEffectiveAttribute(attrs({ Constitution: 24 }), undefined, 'Constitution', null, true, false)).toBe(25);
    expect(getEffectiveAttribute(attrs({ Wisdom: 20 }), undefined, 'Wisdom', null, false, true)).toBe(24);
    // Primal Champion does not touch Dex
    expect(getEffectiveAttribute(attrs({ Dexterity: 18 }), undefined, 'Dexterity', null, true, false)).toBe(18);
  });

  it('applies Grappler (+1 Str/Dex, cap 20)', () => {
    expect(getEffectiveAttribute(attrs({ Strength: 17 }), undefined, 'Strength', null, false, false, 'Strength')).toBe(18);
    expect(getEffectiveAttribute(attrs({ Dexterity: 20 }), undefined, 'Dexterity', null, false, false, 'Dexterity')).toBe(20);
  });

  it('caps Epic Boon at 30 and never reduces', () => {
    expect(getEffectiveAttribute(attrs({ Strength: 29 }), undefined, 'Strength', 'Strength')).toBe(30);
    expect(getEffectiveAttribute(attrs({ Strength: 30 }), undefined, 'Strength', 'Strength')).toBe(30);
  });

  it('a capped feat increase never reduces a score already above its cap', () => {
    // Strength 20 + Epic Boon (+1) = 21; Grappler (cap 20) must NOT drag it down to 20, and Primal
    // Champion (+4, cap 25) then reaches 25 — so selecting Grappler must not lower the total (25, not 24).
    const withoutGrappler = getEffectiveAttribute(
      attrs({ Strength: 20 }), undefined, 'Strength', 'Strength', true, false,
    );
    const withGrappler = getEffectiveAttribute(
      attrs({ Strength: 20 }), undefined, 'Strength', 'Strength', true, false, 'Strength',
    );
    expect(withoutGrappler).toBe(25);
    expect(withGrappler).toBe(25);
  });
});

describe('abilityScoreCeilingForAsi', () => {
  it('is 20 by default and 25 with the matching feature', () => {
    expect(abilityScoreCeilingForAsi('Strength', false, false)).toBe(ABILITY_SCORE_CAP_FROM_ASI);
    expect(abilityScoreCeilingForAsi('Strength', true, false)).toBe(25);
    expect(abilityScoreCeilingForAsi('Wisdom', false, true)).toBe(25);
    expect(abilityScoreCeilingForAsi('Intelligence', true, true)).toBe(20);
  });
});

describe('getEffectiveModifier', () => {
  it('is the modifier of the effective score, or 0 when unchosen', () => {
    expect(getEffectiveModifier(attrs({ Dexterity: 16 }), undefined, 'Dexterity')).toBe(3);
    expect(getEffectiveModifier(attrs({ Strength: 15 }), { Strength: 2 }, 'Strength')).toBe(3);
    expect(getEffectiveModifier({ Constitution: 0 }, undefined, 'Constitution')).toBe(0);
  });
});
