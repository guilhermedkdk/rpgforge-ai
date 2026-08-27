import { describe, it, expect } from 'vitest';
import { createDefaultCharacterData } from '../character/character-factory';
import type { CharacterFormData, FeatureDetail } from '../character/character-form-data';
import type { RuleItemResponse } from '../../../types/ruleitem';
import {
  attributePickedSpells,
  getCastingClasses,
  readSpellcastingAbility,
  spellRowKey,
} from './class-spellcasting';
import { spellClassTag } from './spells';

const CLERIC_ID = 'cls-cleric';
const WIZARD_ID = 'cls-wizard';
const FIGHTER_ID = 'cls-fighter';

// Verbatim from the ingested SRD rows (`normalized.features[].desc`).
const CLERIC_SPELLCASTING_DESC =
  '**Spellcasting Ability.** Wisdom is your spellcasting ability for your Cleric spells.';
const WIZARD_SPELLCASTING_DESC =
  '**Spellcasting Ability.** Intelligence is your spellcasting ability for your Wizard spells.';
const WARLOCK_PACT_MAGIC_DESC =
  '**Spellcasting Ability.** Charisma is the spellcasting ability for your Warlock spells.';

/** Real Cleric/Wizard class-table columns (both classes share these two, verified in the DB). */
const CANTRIPS_ROWS = [
  { level: 1, value: '3' },
  { level: 4, value: '4' },
  { level: 10, value: '5' },
];
const CLERIC_PREPARED_ROWS = [
  { level: 1, value: '4' },
  { level: 2, value: '5' },
  { level: 3, value: '6' },
  { level: 4, value: '7' },
  { level: 5, value: '9' },
];
const WIZARD_PREPARED_ROWS = CLERIC_PREPARED_ROWS;

/** Slot columns as the pack labels them, so the prepared-level cap can be read off the table. */
const SLOT_COLUMNS = [
  { label: '1st-Level Slots', rows: [{ level: 1, value: '2' }, { level: 3, value: '4' }] },
  { label: '2nd-Level Slots', rows: [{ level: 3, value: '2' }, { level: 4, value: '3' }] },
  { label: '3rd-Level Slots', rows: [{ level: 5, value: '2' }] },
];

function spellcastingFeature(
  sourceClassId: string,
  desc: string,
  preparedRows: Array<{ level: number; value: string }>
): FeatureDetail {
  return {
    name: 'Spellcasting',
    desc,
    source: 'class',
    sourceClassId,
    tableData: [
      { label: 'Cantrips', rows: CANTRIPS_ROWS },
      { label: 'Prepared Spells', rows: preparedRows },
      ...SLOT_COLUMNS,
    ],
  } as FeatureDetail;
}

function classItem(id: string, name: string, casterType: string): RuleItemResponse {
  return {
    id,
    name,
    kind: 'CLASS',
    tagKeys: [],
    normalized: { casterType },
  } as unknown as RuleItemResponse;
}

const CLASS_ITEMS = [
  classItem(CLERIC_ID, 'Cleric', 'FULL'),
  classItem(WIZARD_ID, 'Wizard', 'FULL'),
  classItem(FIGHTER_ID, 'Fighter', 'NONE'),
];

function spell(name: string, level: number, classNames: string[]): RuleItemResponse {
  return {
    id: `spell-${name.toLowerCase().replace(/\s+/g, '-')}`,
    name,
    kind: 'SPELL',
    tagKeys: classNames.map(spellClassTag),
    normalized: { level },
  } as unknown as RuleItemResponse;
}

const SPELLS = [
  spell('Sacred Flame', 0, ['Cleric']),
  spell('Guidance', 0, ['Cleric', 'Druid']),
  spell('Fire Bolt', 0, ['Wizard', 'Sorcerer']),
  spell('Mage Hand', 0, ['Wizard', 'Bard']),
  spell('Bless', 1, ['Cleric', 'Paladin']),
  spell('Magic Missile', 1, ['Wizard', 'Sorcerer']),
  spell('Detect Magic', 1, ['Cleric', 'Wizard']),
];
const resolveSpell = (name: string) =>
  SPELLS.find((s) => s.name.toLowerCase() === name.trim().toLowerCase()) ?? null;

/** Cleric 4 / Wizard 3, the shape the editor holds in memory. */
function clericWizard(): CharacterFormData {
  return {
    ...createDefaultCharacterData(),
    classes: [
      {
        classRuleItemId: CLERIC_ID,
        className: 'Cleric',
        subclassRuleItemId: null,
        subclass: '',
        level: 4,
      },
      {
        classRuleItemId: WIZARD_ID,
        className: 'Wizard',
        subclassRuleItemId: null,
        subclass: '',
        level: 3,
      },
    ],
    classRuleItemId: CLERIC_ID,
    className: 'Cleric',
    level: 7,
    featureDetails: [
      spellcastingFeature(CLERIC_ID, CLERIC_SPELLCASTING_DESC, CLERIC_PREPARED_ROWS),
      spellcastingFeature(WIZARD_ID, WIZARD_SPELLCASTING_DESC, WIZARD_PREPARED_ROWS),
    ],
  };
}

describe('readSpellcastingAbility', () => {
  it('reads the ability out of the real SRD feature text', () => {
    expect(readSpellcastingAbility({ desc: CLERIC_SPELLCASTING_DESC } as FeatureDetail)).toBe(
      'Wisdom'
    );
    expect(readSpellcastingAbility({ desc: WIZARD_SPELLCASTING_DESC } as FeatureDetail)).toBe(
      'Intelligence'
    );
  });

  // The pack writes the Warlock's line as "is THE spellcasting ability", not "is your".
  it('reads the Warlock wording', () => {
    expect(readSpellcastingAbility({ desc: WARLOCK_PACT_MAGIC_DESC } as FeatureDetail)).toBe(
      'Charisma'
    );
  });

  it('is empty when nothing declares an ability', () => {
    expect(readSpellcastingAbility({ desc: 'You gain a Rage.' } as FeatureDetail)).toBe('');
    expect(readSpellcastingAbility(null)).toBe('');
  });
});

describe('getCastingClasses', () => {
  it('reads each class table at ITS OWN level, never at the character level', () => {
    const casters = getCastingClasses(clericWizard(), CLASS_ITEMS);

    expect(casters.map((c) => [c.className, c.level, c.maxCantrips, c.maxPrepared])).toEqual([
      // Cleric 4: 4 cantrips / 7 prepared. At the character level 7 it would wrongly be 4 / 11.
      ['Cleric', 4, 4, 7],
      // Wizard 3: 3 cantrips / 6 prepared.
      ['Wizard', 3, 3, 6],
    ]);
    expect(casters.map((c) => c.spellcastingAbility)).toEqual(['Wisdom', 'Intelligence']);
    expect(casters.map((c) => c.spellTagKey)).toEqual([
      'spell:class:cleric',
      'spell:class:wizard',
    ]);
  });

  // The book's own caveat: the multiclass table can grant slots above what a class may prepare.
  it('caps the preparable spell level at what THIS class table reaches', () => {
    const casters = getCastingClasses(clericWizard(), CLASS_ITEMS);
    // Cleric 4 reaches 2nd-level slots, Wizard 3 also 2nd; neither prepares level 3 yet.
    expect(casters.map((c) => [c.className, c.maxSpellLevel])).toEqual([
      ['Cleric', 2],
      ['Wizard', 2],
    ]);
  });

  it('skips a class with no Spellcasting feature', () => {
    const data = clericWizard();
    data.classes = [
      {
        classRuleItemId: FIGHTER_ID,
        className: 'Fighter',
        subclassRuleItemId: null,
        subclass: '',
        level: 5,
      },
      ...data.classes.slice(1),
    ];
    data.featureDetails = data.featureDetails.filter((f) => f.sourceClassId !== CLERIC_ID);

    expect(getCastingClasses(data, CLASS_ITEMS).map((c) => c.className)).toEqual(['Wizard']);
  });

  // Pre-multiclass sheets carry no `sourceClassId`: the single class still has to resolve its table.
  it('falls back to the whole feature list on a single class without source ids', () => {
    const data: CharacterFormData = {
      ...createDefaultCharacterData(),
      classes: [
        {
          classRuleItemId: CLERIC_ID,
          className: 'Cleric',
          subclassRuleItemId: null,
          subclass: '',
          level: 4,
        },
      ],
      classRuleItemId: CLERIC_ID,
      className: 'Cleric',
      level: 4,
      featureDetails: [
        {
          name: 'Spellcasting',
          desc: CLERIC_SPELLCASTING_DESC,
          source: 'class',
          tableData: [
            { label: 'Cantrips', rows: CANTRIPS_ROWS },
            { label: 'Prepared Spells', rows: CLERIC_PREPARED_ROWS },
          ],
        } as FeatureDetail,
      ],
    };

    const casters = getCastingClasses(data, CLASS_ITEMS);
    expect(casters).toHaveLength(1);
    expect([casters[0].maxCantrips, casters[0].maxPrepared]).toEqual([4, 7]);
  });

  // Divine Order → Thaumaturge is a CLERIC feature, so its extra cantrip belongs to the Cleric.
  it('gives an option-granted cantrip to the class whose feature granted it', () => {
    const data = clericWizard();
    data.featureDetails = [
      ...data.featureDetails,
      { name: 'Divine Order', desc: '', source: 'class', sourceClassId: CLERIC_ID } as FeatureDetail,
    ];
    data.raceTraitSelections = { ...data.raceTraitSelections, 'Divine Order': 'thaumaturge' };

    const casters = getCastingClasses(data, CLASS_ITEMS);
    expect(casters.map((c) => c.maxCantrips)).toEqual([5, 3]);
  });
});

describe('attributePickedSpells', () => {
  const casters = getCastingClasses(clericWizard(), CLASS_ITEMS);

  it('keeps an explicit owner and counts it against that class only', () => {
    const ownership = attributePickedSpells({
      spellsByLevel: {
        0: [
          { name: 'Sacred Flame', classRuleItemId: CLERIC_ID },
          { name: 'Fire Bolt', classRuleItemId: WIZARD_ID },
        ],
      },
      castingClasses: casters,
      resolveSpell,
    });

    expect(ownership.ownerByRow.get(spellRowKey(0, 'Sacred Flame'))).toBe(CLERIC_ID);
    expect(ownership.ownerByRow.get(spellRowKey(0, 'Fire Bolt'))).toBe(WIZARD_ID);
    expect(ownership.pickedCantrips.get(CLERIC_ID)).toBe(1);
    expect(ownership.pickedCantrips.get(WIZARD_ID)).toBe(1);
  });

  // Everything picked before the second class was added arrives with no owner.
  it('pins an unowned spell to the only class whose list holds it', () => {
    const ownership = attributePickedSpells({
      spellsByLevel: {
        0: [{ name: 'Sacred Flame' }, { name: 'Mage Hand' }],
        1: [{ name: 'Bless' }, { name: 'Magic Missile' }],
      },
      castingClasses: casters,
      resolveSpell,
    });

    expect(ownership.ownerByRow.get(spellRowKey(0, 'Sacred Flame'))).toBe(CLERIC_ID);
    expect(ownership.ownerByRow.get(spellRowKey(0, 'Mage Hand'))).toBe(WIZARD_ID);
    expect(ownership.ownerByRow.get(spellRowKey(1, 'Bless'))).toBe(CLERIC_ID);
    expect(ownership.ownerByRow.get(spellRowKey(1, 'Magic Missile'))).toBe(WIZARD_ID);
  });

  // Detect Magic is on both lists; the single-list picks are placed first so it lands where there is
  // still room instead of pushing a class over its allowance.
  it('places a spell on both lists into a class that still has room', () => {
    const ownership = attributePickedSpells({
      spellsByLevel: {
        0: [
          { name: 'Sacred Flame' },
          { name: 'Guidance' },
          { name: 'Fire Bolt' },
          { name: 'Mage Hand' },
        ],
        1: [{ name: 'Detect Magic' }, { name: 'Bless' }],
      },
      castingClasses: casters,
      resolveSpell,
    });

    expect(ownership.pickedCantrips.get(CLERIC_ID)).toBe(2);
    expect(ownership.pickedCantrips.get(WIZARD_ID)).toBe(2);
    expect(ownership.ownerByRow.get(spellRowKey(1, 'Bless'))).toBe(CLERIC_ID);
    expect(ownership.ownerByRow.get(spellRowKey(1, 'Detect Magic'))).toBeTruthy();
    expect(ownership.pickedPrepared.get(CLERIC_ID)! + ownership.pickedPrepared.get(WIZARD_ID)!).toBe(
      2
    );
  });

  it('ignores granted rows: they never spend an allowance', () => {
    const ownership = attributePickedSpells({
      spellsByLevel: {
        0: [{ name: 'Guidance', granted: true, grantSource: 'Magic Initiate' }],
        1: [{ name: 'Bless', granted: true, grantSource: 'Magic Initiate' }],
      },
      castingClasses: casters,
      resolveSpell,
    });

    expect(ownership.ownerByRow.size).toBe(0);
    expect(ownership.pickedCantrips.get(CLERIC_ID)).toBe(0);
    expect(ownership.pickedPrepared.get(CLERIC_ID)).toBe(0);
  });

  it('drops an owner naming a class the character no longer has', () => {
    const ownership = attributePickedSpells({
      spellsByLevel: { 0: [{ name: 'Sacred Flame', classRuleItemId: 'cls-removed' }] },
      castingClasses: casters,
      resolveSpell,
    });

    expect(ownership.ownerByRow.get(spellRowKey(0, 'Sacred Flame'))).toBe(CLERIC_ID);
  });

  it('returns empty maps when nothing casts', () => {
    const ownership = attributePickedSpells({
      spellsByLevel: { 0: [{ name: 'Sacred Flame' }] },
      castingClasses: [],
    });

    expect(ownership.ownerByRow.size).toBe(0);
    expect(ownership.pickedCantrips.size).toBe(0);
  });

  // Without the catalog every class is a candidate, so the placement still has to be deterministic.
  it('fills in class order when no catalog is available', () => {
    const ownership = attributePickedSpells({
      spellsByLevel: { 0: [{ name: 'A' }, { name: 'B' }, { name: 'C' }, { name: 'D' }] },
      castingClasses: casters,
    });

    expect(ownership.pickedCantrips.get(CLERIC_ID)).toBe(4);
    expect(ownership.pickedCantrips.get(WIZARD_ID)).toBe(0);
  });
});
