import { describe, it, expect } from 'vitest';
import { singularizeIfPlural } from './character-options';

/**
 * The names below are the real ones from the D&D SRD 5.2 pack (`rule_items` table). The sensitive
 * point is the "ends with s" guard: it prevents singularization from hitting names that end in s
 * without being a regular plural (Clothes, Arcane Focus). See the compound-name test.
 */
describe('singularizeIfPlural', () => {
  it('leaves the name alone when qty <= 1 (nothing to singularize)', () => {
    expect(singularizeIfPlural('Arrows', 1)).toBe('Arrows');
    expect(singularizeIfPlural('Arrows', 0)).toBe('Arrows');
  });

  it('drops the regular -s plural when qty > 1', () => {
    expect(singularizeIfPlural('Arrows', 20)).toBe('Arrow');
    expect(singularizeIfPlural('Bolts', 20)).toBe('Bolt');
    expect(singularizeIfPlural('Needles', 50)).toBe('Needle');
    expect(singularizeIfPlural('Crossbow Bolts', 20)).toBe('Crossbow Bolt');
  });

  it('drops the -es plural for -ch/-sh/-s/-z stems', () => {
    expect(singularizeIfPlural('Pouches', 2)).toBe('Pouch');
    expect(singularizeIfPlural('Torches', 5)).toBe('Torch');
  });

  it('never touches a GP line', () => {
    expect(singularizeIfPlural('10 GP', 10)).toBe('10 GP');
    expect(singularizeIfPlural('GP', 5)).toBe('GP');
  });

  /**
   * Compounds ("Bullets, Sling") are left intact on purpose: only the noun is plural, but
   * singularizing the 1st segment would break names whose 1st segment ends in s without being
   * plural ("Clothes, Fine" → "Clothe"; "Arcane Focus, Crystal" → "Arcane Focu"). The surviving
   * plural here is also what keeps the name resolvable back to the catalog id.
   */
  it('leaves comma-compound names untouched, plural noun included', () => {
    expect(singularizeIfPlural('Bullets, Sling', 20)).toBe('Bullets, Sling');
    expect(singularizeIfPlural('Bullets, Firearm', 10)).toBe('Bullets, Firearm');
    expect(singularizeIfPlural('Clothes, Fine', 2)).toBe('Clothes, Fine');
    expect(singularizeIfPlural('Arcane Focus, Crystal', 2)).toBe('Arcane Focus, Crystal');
    expect(singularizeIfPlural("Clothes, Traveler's", 2)).toBe("Clothes, Traveler's");
  });
});
