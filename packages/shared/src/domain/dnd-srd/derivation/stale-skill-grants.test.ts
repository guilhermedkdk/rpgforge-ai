import { describe, it, expect } from 'vitest';
import { createDefaultCharacterData } from '../character/character-factory';
import { applyDerivedToCharacterData } from './derived-character-stats';
import type { CharacterFormData } from '../character/character-form-data';
import type { DerivedCharacterStats } from './derived-character-stats';

// A skill stays `true` in `data.skillProficiencies` even after the source that granted it is gone
// (swapping the background, or a class swap that invalidates the old picks). `applyDerivedToCharacterData`
// is the only place that sees the OLD provenance and the NEW rules at once, so it owns the cleanup —
// this used to be attempted from web effects, which raced the derivation and left the sheet either
// missing the new grants or carrying the old ones on top of them.

const derivedWith = (overrides: Partial<DerivedCharacterStats> = {}): DerivedCharacterStats =>
  ({
    skillProficiencies: {},
    savingThrows: {},
    proficiencies: '',
    featureDetails: [],
    classSkillOptions: { keys: [], chooseN: null },
    ...overrides,
  }) as unknown as DerivedCharacterStats;

const sheet = (overrides: Partial<CharacterFormData> = {}): CharacterFormData => ({
  ...createDefaultCharacterData(),
  classRuleItemId: 'class-1',
  className: 'Fighter',
  backgroundRuleItemId: 'bg-1',
  background: 'Acolyte',
  ...overrides,
});

describe('applyDerivedToCharacterData: stale skill grants', () => {
  it('drops the previous background grants and applies the new ones', () => {
    // On the sheet: Acolyte (insight/religion). Derived now: Soldier (athletics/intimidation).
    const data = sheet({
      backgroundSkillKeys: ['insight', 'religion'],
      skillProficiencies: { insight: true, religion: true },
    });
    const derived = derivedWith({
      skillProficiencies: { athletics: true, intimidation: true },
    });

    const next = applyDerivedToCharacterData(data, derived);

    expect(next.skillProficiencies.athletics).toBe(true);
    expect(next.skillProficiencies.intimidation).toBe(true);
    expect(next.skillProficiencies.insight).toBe(false);
    expect(next.skillProficiencies.religion).toBe(false);
    expect(next.backgroundSkillKeys).toEqual(['athletics', 'intimidation']);
  });

  it('drops class picks the new class does not offer, keeping the ones it does', () => {
    const data = sheet({
      classSkillProficiencyKeys: ['arcana', 'history'],
      skillProficiencies: { arcana: true, history: true },
    });
    // New class offers history but not arcana.
    const derived = derivedWith({
      classSkillOptions: { keys: ['history', 'stealth'], chooseN: 2 },
    });

    const next = applyDerivedToCharacterData(data, derived);

    expect(next.skillProficiencies.history).toBe(true);
    expect(next.skillProficiencies.arcana).toBe(false);
    expect(next.classSkillProficiencyKeys).toEqual(['history']);
  });

  it('never revokes a skill another source still grants', () => {
    // Athletics came from the old background AND from a race trait pick (Skillful).
    const data = sheet({
      backgroundSkillKeys: ['athletics'],
      raceTraitSelections: { Skillful: 'athletics' },
      skillProficiencies: { athletics: true },
    });
    const derived = derivedWith({ skillProficiencies: { arcana: true } });

    const next = applyDerivedToCharacterData(data, derived);

    expect(next.skillProficiencies.arcana).toBe(true);
    expect(next.skillProficiencies.athletics).toBe(true);
  });

  it('keeps a Skilled-feat skill when the class list no longer offers it', () => {
    const data = sheet({
      classSkillProficiencyKeys: ['stealth'],
      skilledProficiencyChoices: ['skill:stealth'],
      skillProficiencies: { stealth: true },
    });
    const derived = derivedWith({ classSkillOptions: { keys: ['arcana'], chooseN: 1 } });

    const next = applyDerivedToCharacterData(data, derived);

    expect(next.skillProficiencies.stealth).toBe(true);
  });

  it('leaves an unchanged identity alone (the play/backend path is a no-op)', () => {
    const data = sheet({
      backgroundSkillKeys: ['insight', 'religion'],
      classSkillProficiencyKeys: ['athletics'],
      skillProficiencies: { insight: true, religion: true, athletics: true },
    });
    const derived = derivedWith({
      skillProficiencies: { insight: true, religion: true },
      classSkillOptions: { keys: ['athletics', 'stealth'], chooseN: 2 },
    });

    const next = applyDerivedToCharacterData(data, derived);

    expect(next.skillProficiencies.insight).toBe(true);
    expect(next.skillProficiencies.religion).toBe(true);
    expect(next.skillProficiencies.athletics).toBe(true);
  });
});
