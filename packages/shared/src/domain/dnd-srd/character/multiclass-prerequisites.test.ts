import { describe, it, expect } from 'vitest';
import type { RuleItemResponse } from '../../../types/ruleitem';
import { createDefaultCharacterData } from './character-factory';
import { setClassEntryLevel, syncClassMirrors } from './class-entries';
import {
  getMulticlassPrerequisites,
  getSheetMulticlassPrerequisiteMisses,
  planMulticlassPrerequisiteRemovals,
} from './multiclass-prerequisites';
import {
  applyDerivedToCharacterData,
  getDerivedFromRuleItems,
} from '../derivation/derived-character-stats';
import { getCharacterAbilityScores } from '../derivation/ability-progression';
import { getCharacterSheetSaveValidationErrors } from '../validation/character-sheet-save-validation';
import type { CharacterFormData } from './character-form-data';

/**
 * The prerequisite has to hold for as long as the class is on the sheet, not only when it is taken.
 *
 * Lowering a class level prunes the Ability Score Improvement that raised the ability, so a legal
 * Fighter 4 / Warlock 1 becomes illegal on a single step and the class stays. Fixtures mirror the
 * real ingested shape; the same sequence was run end to end against the real SRD rows in the
 * database (Fighter/Warlock/Human/Soldier), where levelling back UP re-derives an EMPTY ASI slot
 * and does NOT restore the pick.
 */

const classItem = (input: {
  id: string;
  name: string;
  key: string;
  die: string;
  saves: string[];
  primaryAbilities: { mode: 'any' | 'all'; abilities: string[] };
  features?: Array<{ name: string; gainedAt: number[] }>;
}): RuleItemResponse =>
  ({
    id: input.id,
    name: input.name,
    slug: input.key,
    sourceKey: input.key,
    kind: 'CLASS',
    tagKeys: [],
    normalized: {
      key: input.key,
      hitPoints: { hitDiceName: `1${input.die} per ${input.name} level` },
      savingThrows: input.saves.map((name) => ({ name })),
      features: [
        {
          key: `${input.key}_core-traits`,
          name: `Core ${input.name} Traits`,
          featureType: 'CORE',
          desc: [
            '|||',
            '|---|---|',
            `|Primary Ability|${input.primaryAbilities.abilities[0]}|`,
            `|Hit Point Die|${input.die} per ${input.name} level|`,
            '|Starting Equipment|Choose A or B: (A) Gear; or (B) 50 GP|',
          ].join('\n'),
        },
        ...(input.features ?? []).map((f) => ({
          key: `${input.key}_${f.name.toLowerCase().replace(/\s+/g, '-')}`,
          name: f.name,
          featureType: 'CLASS_LEVEL_FEATURE',
          desc: `${f.name} description.`,
          gainedAt: f.gainedAt.map((level) => ({ level, detail: '' })),
        })),
      ],
      multiclassing: { primaryAbilities: input.primaryAbilities, grants: {} },
    },
    raw: {},
  }) as unknown as RuleItemResponse;

const fighter = classItem({
  id: 'class-fighter',
  name: 'Fighter',
  key: 'fighter',
  die: 'd10',
  saves: ['Strength', 'Constitution'],
  primaryAbilities: { mode: 'any', abilities: ['Strength', 'Dexterity'] },
  features: [{ name: 'Ability Score Improvement', gainedAt: [4, 6, 8, 12, 14, 16] }],
});

const warlock = classItem({
  id: 'class-warlock',
  name: 'Warlock',
  key: 'warlock',
  die: 'd8',
  saves: ['Wisdom', 'Charisma'],
  primaryAbilities: { mode: 'all', abilities: ['Charisma'] },
});

// The ASI only applies once the background pool is spent, so the background is part of the fixture.
const soldier = {
  id: 'bg-soldier',
  name: 'Soldier',
  slug: 'soldier',
  kind: 'BACKGROUND',
  tagKeys: [],
  normalized: {
    key: 'soldier',
    benefits: [{ type: 'ability_score', desc: 'Strength, Dexterity, Constitution' }],
  },
  raw: {},
} as unknown as RuleItemResponse;

// Two REQUIRED abilities, the shape a single-ability fixture cannot catch.
const monk = classItem({
  id: 'class-monk',
  name: 'Monk',
  key: 'monk',
  die: 'd8',
  saves: ['Strength', 'Dexterity'],
  primaryAbilities: { mode: 'all', abilities: ['Dexterity', 'Wisdom'] },
});

const classes = [fighter, warlock];

const derive = (data: CharacterFormData): CharacterFormData => {
  const derived = getDerivedFromRuleItems({
    classes: (data.classes ?? [])
      .filter((c) => c.classRuleItemId)
      .map((c) => ({
        classItem: classes.find((item) => item.id === c.classRuleItemId) ?? null,
        subclassItem: null,
        level: c.level,
      })),
    raceItem: null,
    backgroundItem: soldier,
  });
  return syncClassMirrors(applyDerivedToCharacterData(data, derived));
};

// Fighter 4 / Warlock 1 whose Charisma 13 comes ONLY from the level-4 ASI.
const buildSheet = (): CharacterFormData => {
  let data = syncClassMirrors({
    ...createDefaultCharacterData(),
    name: 'Repro',
    abilityScoreMethod: 'standard-array',
    attributes: {
      Strength: 15,
      Dexterity: 14,
      Constitution: 13,
      Intelligence: 10,
      Wisdom: 8,
      Charisma: 12,
    },
    backgroundRuleItemId: soldier.id,
    background: soldier.name,
    classes: [
      {
        classRuleItemId: fighter.id,
        className: 'Fighter',
        subclassRuleItemId: null,
        subclass: '',
        level: 4,
      },
      {
        classRuleItemId: warlock.id,
        className: 'Warlock',
        subclassRuleItemId: null,
        subclass: '',
        level: 1,
      },
    ],
  } as CharacterFormData);
  data = derive(data);
  return derive({
    ...data,
    backgroundAbilityScoreIncrease: { Strength: 2, Dexterity: 1 },
    abilityScoreImprovementByGain: [
      { kind: 'increase_scores', byAbility: { Charisma: 1, Strength: 1 } },
    ],
  });
};

describe('multiclass prerequisites over the life of the sheet', () => {
  it('holds while the ASI that raised the ability is still granted', () => {
    const data = buildSheet();
    expect(getCharacterAbilityScores(data).Charisma).toBe(13);
    expect(getSheetMulticlassPrerequisiteMisses(data, classes)).toEqual([]);
  });

  it('reports the class that stopped qualifying when a level step prunes the ASI', () => {
    const lowered = derive(setClassEntryLevel(buildSheet(), fighter.id, 3));

    // The gain is gone, so the sheet keeps the Warlock while no longer paying for it.
    expect(lowered.abilityScoreImprovementByGain).toEqual([]);
    expect(getCharacterAbilityScores(lowered).Charisma).toBe(12);
    expect(lowered.classes?.map((c) => c.className)).toEqual(['Fighter', 'Warlock']);

    const misses = getSheetMulticlassPrerequisiteMisses(lowered, classes);
    expect(misses).toHaveLength(1);
    expect(misses[0]).toMatchObject({
      className: 'Warlock',
      ability: 'Charisma',
      required: 13,
      actual: 12,
    });
  });

  it('levelling back up does NOT restore the pick, so the miss stands', () => {
    const lowered = derive(setClassEntryLevel(buildSheet(), fighter.id, 3));
    const restored = derive(setClassEntryLevel(lowered, fighter.id, 4));

    // One empty slot: the ASI is offered again, but the points it held are gone.
    expect(restored.abilityScoreImprovementByGain).toEqual([null]);
    expect(getSheetMulticlassPrerequisiteMisses(restored, classes)).toHaveLength(1);
  });

  it('the save validation blocks the same sheet the cue marks', () => {
    const lowered = derive(setClassEntryLevel(buildSheet(), fighter.id, 3));
    const errors = getCharacterSheetSaveValidationErrors(lowered, {
      classes,
      subclasses: [],
      feats: [],
      standardLanguageOptions: [],
      skillsList: [],
    });
    expect(errors).toContain('Multiclasse em Warlock exige Charisma 13: você tem 12.');
  });

  it('plans the failing multiclass entry for removal', () => {
    const lowered = derive(setClassEntryLevel(buildSheet(), fighter.id, 3));
    expect(planMulticlassPrerequisiteRemovals(lowered, classes).map((e) => e.className)).toEqual([
      'Warlock',
    ]);
  });

  it('drops the OTHER classes when the initial one is what fails', () => {
    // Strength and Dexterity both under 13, so the Fighter itself misses. It cannot leave the sheet,
    // and a single class has no requirement at all, so the Warlock is what goes.
    const broken = derive({
      ...buildSheet(),
      attributes: {
        Strength: 12,
        Dexterity: 10,
        Constitution: 13,
        Intelligence: 14,
        Wisdom: 8,
        Charisma: 15,
      },
      backgroundAbilityScoreIncrease: {},
      abilityScoreImprovementByGain: [null],
    });

    expect(getSheetMulticlassPrerequisiteMisses(broken, classes).map((m) => m.className)).toContain(
      'Fighter'
    );
    expect(planMulticlassPrerequisiteRemovals(broken, classes).map((e) => e.className)).toEqual([
      'Warlock',
    ]);
  });

  it('a single class is never a multiclass, whatever the scores', () => {
    const data = buildSheet();
    const single = syncClassMirrors({ ...data, classes: [data.classes![0]] });
    expect(getSheetMulticlassPrerequisiteMisses(single, classes)).toEqual([]);
  });
});

describe('what an unmet prerequisite reports', () => {
  it('carries EVERY primary ability of an "all" requirement, not only the one that fell short', () => {
    const check = getMulticlassPrerequisites({
      attributes: { Dexterity: 16, Wisdom: 8 },
      currentClassItems: [fighter],
      newClassItem: monk,
    });

    expect(check.ok).toBe(false);
    expect(check.missing).toEqual([
      {
        abilities: ['Dexterity', 'Wisdom'],
        mode: 'all',
        ability: 'Wisdom',
        actual: 8,
        required: 13,
        className: 'Monk',
      },
    ]);
  });

  it('carries every alternative of an "any" requirement, pointing at the closest score', () => {
    const check = getMulticlassPrerequisites({
      attributes: { Strength: 10, Dexterity: 12, Charisma: 15 },
      currentClassItems: [warlock],
      newClassItem: fighter,
    });

    expect(check.missing).toEqual([
      {
        abilities: ['Strength', 'Dexterity'],
        mode: 'any',
        ability: 'Dexterity',
        actual: 12,
        required: 13,
        className: 'Fighter',
      },
    ]);
  });
});
