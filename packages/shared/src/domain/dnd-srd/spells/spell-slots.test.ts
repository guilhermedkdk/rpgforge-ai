import { describe, it, expect } from 'vitest';
import type { FeatureDetail } from '../character/character-form-data';
import type { CastingClass } from './class-spellcasting';
import { computeSpellSlots } from './spell-slots';

/**
 * Slot columns as the pack labels them ("1st"…"9th" + "Slots"), holding the real SRD rows for the
 * levels each test reads. Only the columns a case needs are filled: the table CONTENTS are pinned
 * by `multiclass-spellcasting.test.ts`, what is under test here is which table gets used.
 */
function slotColumns(rowsPerLevel: Record<number, number[]>): FeatureDetail['tableData'] {
  const ordinals = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th'];
  return ordinals.map((ordinal, index) => ({
    label: `${ordinal}-Level Spell Slots`,
    rows: Object.entries(rowsPerLevel).map(([classLevel, counts]) => ({
      level: Number(classLevel),
      value: String(counts[index] ?? 0),
    })),
  }));
}

function caster(
  overrides: Partial<CastingClass> & Pick<CastingClass, 'className' | 'level' | 'casterType'>
): CastingClass {
  return {
    classRuleItemId: `cls-${overrides.className.toLowerCase()}`,
    spellcastingAbility: 'Intelligence',
    spellTagKey: `spell:class:${overrides.className.toLowerCase()}`,
    maxCantrips: 0,
    maxPrepared: 0,
    maxSpellLevel: 9,
    feature: { name: 'Spellcasting', desc: '', source: 'class' } as FeatureDetail,
    ...overrides,
  } as CastingClass;
}

/** Wizard/Cleric/Bard share the full-caster progression; these are the real rows at 3 and 6. */
const FULL_CASTER_TABLE = slotColumns({
  3: [4, 2, 0, 0, 0, 0, 0, 0, 0],
  6: [4, 3, 3, 0, 0, 0, 0, 0, 0],
});
/** Paladin at 6: the real half-caster row. */
const PALADIN_TABLE = slotColumns({ 6: [4, 2, 0, 0, 0, 0, 0, 0, 0] });

function withTable(c: CastingClass, tableData: FeatureDetail['tableData']): CastingClass {
  return { ...c, feature: { ...c.feature, tableData } as FeatureDetail };
}

/** Warlock 3: two Pact Magic slots, both of level 2. */
const PACT_FEATURE = {
  name: 'Pact Magic',
  desc: '',
  source: 'class',
  tableData: [
    { label: 'Spell Slots', rows: [{ level: 3, value: '2' }] },
    { label: 'Slot Level', rows: [{ level: 3, value: '2' }] },
  ],
} as FeatureDetail;

const levels = (totals: Record<number, number>) =>
  Object.entries(totals)
    .filter(([, count]) => count > 0)
    .map(([level, count]) => `${level}:${count}`)
    .join(' ');

describe('computeSpellSlots', () => {
  // Two Spellcasting classes: the combined caster level drives the multiclass table, and it grants
  // level-3 slots that neither class would give on its own.
  it('uses the multiclass table with two Spellcasting classes', () => {
    const result = computeSpellSlots({
      castingClasses: [
        withTable(caster({ className: 'Cleric', level: 3, casterType: 'FULL' }), FULL_CASTER_TABLE),
        withTable(caster({ className: 'Wizard', level: 3, casterType: 'FULL' }), FULL_CASTER_TABLE),
      ],
    });

    expect(result.usesMulticlassTable).toBe(true);
    expect(result.casterLevel).toBe(6);
    expect(levels(result.totalsByLevel)).toBe('1:4 2:3 3:3');
    expect(result.availabilityByLevel[3]).toBe(true);
    expect(result.availabilityByLevel[4]).toBeUndefined();
  });

  // The SRD's own worked example, half caster rounding UP: 2 + 3 = 5.
  it('counts a half caster as half its levels, rounded up', () => {
    const result = computeSpellSlots({
      castingClasses: [
        withTable(caster({ className: 'Ranger', level: 4, casterType: 'HALF' }), FULL_CASTER_TABLE),
        withTable(
          caster({ className: 'Sorcerer', level: 3, casterType: 'FULL' }),
          FULL_CASTER_TABLE
        ),
      ],
    });

    expect(result.casterLevel).toBe(5);
    expect(levels(result.totalsByLevel)).toBe('1:4 2:3 3:2');
  });

  // "If you multiclass but have the Spellcasting feature from only one class, follow the rules for
  // that class": a Fighter 5 / Wizard 3 is a Wizard 3, not a caster of level 3 by the shared table.
  it('falls back to the single caster OWN table, read at ITS level', () => {
    const result = computeSpellSlots({
      castingClasses: [
        withTable(caster({ className: 'Wizard', level: 3, casterType: 'FULL' }), FULL_CASTER_TABLE),
        caster({ className: 'Fighter', level: 5, casterType: 'NONE' }),
      ],
    });

    expect(result.usesMulticlassTable).toBe(false);
    expect(levels(result.totalsByLevel)).toBe('1:4 2:2');
    expect(result.availabilityByLevel[3]).toBe(false);
  });

  it('reads a lone half caster off its own slower table', () => {
    const result = computeSpellSlots({
      castingClasses: [
        withTable(caster({ className: 'Paladin', level: 6, casterType: 'HALF' }), PALADIN_TABLE),
      ],
    });

    expect(result.usesMulticlassTable).toBe(false);
    expect(levels(result.totalsByLevel)).toBe('1:4 2:2');
  });

  // Pact Magic is a separate pool: it never feeds the multiclass table, and it adds ON TOP because
  // the SRD lets either pool cast the other's prepared spells.
  it('adds Pact Magic on top without triggering the multiclass table', () => {
    const result = computeSpellSlots({
      castingClasses: [
        {
          ...caster({ className: 'Warlock', level: 3, casterType: 'PACT' }),
          feature: PACT_FEATURE,
        },
        withTable(
          caster({ className: 'Sorcerer', level: 3, casterType: 'FULL' }),
          FULL_CASTER_TABLE
        ),
      ],
    });

    expect(result.usesMulticlassTable).toBe(false);
    expect(result.pactMagic).toEqual({ slotLevel: 2, totalSlots: 2 });
    // Sorcerer 3 gives 4/2; the pact adds 2 slots to every level up to 2.
    expect(levels(result.totalsByLevel)).toBe('1:6 2:4');
  });

  it('gives a lone Warlock only its pact pool', () => {
    const result = computeSpellSlots({
      castingClasses: [
        {
          ...caster({ className: 'Warlock', level: 3, casterType: 'PACT' }),
          feature: PACT_FEATURE,
        },
      ],
    });

    expect(result.casterLevel).toBe(0);
    expect(levels(result.totalsByLevel)).toBe('1:2 2:2');
    expect(result.availabilityByLevel[3]).toBeUndefined();
  });

  // Mid-hydration, and pre-multiclass sheets whose features carry no `sourceClassId`.
  it('falls back to the sheet-wide feature when no class resolved one', () => {
    const result = computeSpellSlots({
      castingClasses: [],
      fallbackFeature: {
        name: 'Spellcasting',
        desc: '',
        source: 'class',
        tableData: FULL_CASTER_TABLE,
      } as FeatureDetail,
      fallbackLevel: 6,
    });

    expect(levels(result.totalsByLevel)).toBe('1:4 2:3 3:3');
  });

  it('gives nothing when nothing casts', () => {
    const result = computeSpellSlots({ castingClasses: [] });
    expect(levels(result.totalsByLevel)).toBe('');
    expect(result.pactMagic).toBeNull();
  });
});
