import { describe, it, expect } from 'vitest';
import { createDefaultCharacterData } from '../character/character-factory';
import { computeSpellModifiers } from './spell-modifiers';
import type { CharacterFormData } from '../character/character-form-data';
import type { RuleItemResponse } from '../../../types/ruleitem';

// Every option/feature text below is copied verbatim from the ingested SRD 5.2 rows: the modifiers
// are matched on the rule TEXT (ability name, ft-per-level, cost, damage type list), not on names,
// so the fixtures have to be the real wording for the tests to mean anything.

const AGONIZING_BLAST_DESC =
  "Choose one of your known Warlock cantrips that deals damage. You can add your Charisma modifier to that spell's damage rolls.";
const ELDRITCH_SPEAR_DESC =
  'Choose one of your known Warlock cantrips that deals damage and has a range of 10+ feet. When you cast that spell, its range increases by a number of feet equal to 30 times your Warlock level.';
const REPELLING_BLAST_DESC =
  'Choose one of your known Warlock cantrips that requires an attack roll. When you hit a Large or smaller creature with that cantrip, you can push the creature up to 10 feet straight away from you.';
const DEVILS_SIGHT_DESC =
  'You can see normally in Dim Light and Darkness both magical and nonmagical—within 120 feet of yourself.';

const INVOCATION_OPTIONS = [
  { key: 'agonizing-blast', label: 'Agonizing Blast', desc: AGONIZING_BLAST_DESC },
  { key: 'eldritch-spear', label: 'Eldritch Spear', desc: ELDRITCH_SPEAR_DESC },
  { key: 'repelling-blast', label: 'Repelling Blast', desc: REPELLING_BLAST_DESC },
  { key: 'devils-sight', label: "Devil's Sight", desc: DEVILS_SIGHT_DESC },
];

const METAMAGIC_OPTIONS = [
  {
    key: 'careful-spell',
    label: 'Careful Spell',
    desc: "*Cost: 1 Sorcery Point*\n\nWhen you cast a spell that forces other creatures to make a saving throw, you can protect some of those creatures from the spell's full force. To do so, spend 1 Sorcery Point and choose a number of those creatures up to your Charisma modifier (minimum of one creature). A chosen creature automatically succeeds on its saving throw against the spell, and it takes no damage if it would normally take half damage on a successful save.",
  },
  {
    key: 'distant-spell',
    label: 'Distant Spell',
    desc: "*Cost: 1 Sorcery Point*\n\nWhen you cast a spell that has a range of at least 5 feet, you can spend 1 Sorcery Point to double the spell's range. Or when you cast a spell that has a range of Touch, you can spend 1 Sorcery Point to make the spell's range 30 feet.",
  },
  {
    key: 'empowered-spell',
    label: 'Empowered Spell',
    desc: '*Cost: 1 Sorcery Point*\n\nWhen you roll damage for a spell, you can spend 1 Sorcery Point to reroll a number of the damage dice up to your Charisma modifier (minimum of one), and you must use the new rolls.',
  },
  {
    key: 'quickened-spell',
    label: 'Quickened Spell',
    desc: '*Cost: 2 Sorcery Points*\n\nWhen you cast a spell that has a casting time of an action, you can spend 2 Sorcery Points to change the casting time to a Bonus Action for this casting.',
  },
  {
    key: 'seeking-spell',
    label: 'Seeking Spell',
    desc: '*Cost: 1 Sorcery Point*\n\nIf you make an attack roll for a spell and miss, you can spend 1 Sorcery Point to reroll the d20, and you must use the new roll.',
  },
  {
    key: 'transmuted-spell',
    label: 'Transmuted Spell',
    desc: '*Cost: 1 Sorcery Point*\n\nWhen you cast a spell that deals a type of damage from the following list, you can spend 1 Sorcery Point to change that damage type to one of the other listed types: Acid, Cold, Fire, Lightning, Poison, Thunder.',
  },
  {
    key: 'twinned-spell',
    label: 'Twinned Spell',
    desc: "*Cost: 1 Sorcery Point*\n\nWhen you cast a spell, such as *Charm Person*, that can be cast with a higher-level spell slot to target an additional creature, you can spend 1 Sorcery Point to increase the spell's effective level by 1.",
  },
];

type SpellOpts = {
  level?: number;
  school?: string;
  damageRoll?: string;
  damageTypes?: string[];
  rangeText?: string;
  castingTime?: string;
  duration?: string;
  savingThrowAbility?: string;
  attackRoll?: boolean;
  desc?: string;
  higherLevel?: string;
};

function spellItem(name: string, o: SpellOpts = {}): RuleItemResponse {
  return {
    id: `spell-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    packId: 'pack',
    kind: 'SPELL',
    source: 'test',
    sourceKey: name,
    name,
    normalized: {
      level: o.level ?? 0,
      school: { key: o.school ?? 'evocation', name: o.school ?? 'evocation' },
      damageRoll: o.damageRoll ?? '',
      damageTypes: o.damageTypes ?? [],
      rangeText: o.rangeText ?? '',
      castingTime: o.castingTime ?? 'action',
      duration: o.duration ?? 'instantaneous',
      savingThrowAbility: o.savingThrowAbility ?? '',
      attackRoll: o.attackRoll ?? false,
      desc: o.desc ?? '',
      higherLevel: o.higherLevel ?? '',
    },
    raw: {},
    tagKeys: [],
    createdAt: '',
    updatedAt: '',
  };
}

const CATALOG: RuleItemResponse[] = [
  spellItem('Eldritch Blast', {
    damageRoll: '1d10',
    damageTypes: ['force'],
    rangeText: '120 feet',
    attackRoll: true,
  }),
  spellItem('Sacred Flame', {
    damageRoll: '1d8',
    damageTypes: ['radiant'],
    rangeText: '60 feet',
    savingThrowAbility: 'dexterity',
  }),
  spellItem('Guidance', { damageRoll: '1d4', rangeText: 'Touch' }),
  spellItem('Fire Bolt', {
    damageRoll: '1d10',
    damageTypes: ['fire'],
    rangeText: '120 feet',
    attackRoll: true,
  }),
  spellItem('Fireball', {
    level: 3,
    damageRoll: '8d6',
    damageTypes: ['fire'],
    rangeText: '150 feet',
    savingThrowAbility: 'dexterity',
  }),
  spellItem('Cure Wounds', {
    level: 1,
    school: 'abjuration',
    damageRoll: '2d8',
    rangeText: 'Touch',
    desc: 'A creature you touch regains a number of Hit Points equal to 2d8 plus your spellcasting ability modifier.',
  }),
  spellItem('Charm Person', {
    level: 1,
    school: 'enchantment',
    rangeText: '30 feet',
    duration: '1 hour',
    savingThrowAbility: 'wisdom',
    higherLevel: 'You can target one additional creature for each spell slot level above 1.',
  }),
  spellItem("Hunter's Mark", {
    level: 1,
    school: 'divination',
    damageRoll: '1d6',
    damageTypes: ['force'],
    rangeText: '90 feet',
    castingTime: 'bonus-action',
    duration: '1 hour',
  }),
];

const resolveSpell = (name: string) =>
  CATALOG.find((s) => s.name.toLowerCase() === name.trim().toLowerCase()) ?? null;

type Feature = NonNullable<CharacterFormData['featureDetails']>[number];

const feature = (name: string, extra: Partial<Feature> = {}): Feature => ({
  name,
  desc: '',
  source: 'subclass',
  ...extra,
});

function character(overrides: Partial<CharacterFormData>): CharacterFormData {
  return { ...createDefaultCharacterData(), ...overrides };
}

const modsFor = (data: CharacterFormData, spell: string) =>
  computeSpellModifiers({ data, resolveSpell }).get(spell.toLowerCase()) ?? [];

const badges = (data: CharacterFormData, spell: string) => modsFor(data, spell).map((m) => m.badge);

const names = (data: CharacterFormData, spell: string) =>
  modsFor(data, spell).map((m) => m.featureName);

const invocationFeature = feature('Eldritch Invocations', {
  source: 'class',
  options: INVOCATION_OPTIONS,
});

describe('computeSpellModifiers — Eldritch Invocations', () => {
  it('reports Agonizing Blast as the resolved Charisma damage bonus, not the feature name', () => {
    const data = character({
      level: 5,
      attributes: { Charisma: 18 },
      spellsByLevel: { 0: [{ name: 'Eldritch Blast' }] },
      featureDetails: [invocationFeature],
      eldritchInvocationSelections: [{ key: 'agonizing-blast', spellName: 'Eldritch Blast' }],
    });

    expect(modsFor(data, 'Eldritch Blast')).toHaveLength(1);
    expect(modsFor(data, 'Eldritch Blast')[0]).toMatchObject({
      featureName: 'Agonizing Blast',
      sourceLabel: 'Eldritch Invocation',
      kind: 'damage',
      badge: '+4 dmg',
      detail: "+4 damage (Charisma modifier) on this spell's damage rolls",
    });
  });

  it('scales Eldritch Spear by class level and shows the base → final range', () => {
    const data = character({
      level: 12,
      spellsByLevel: { 0: [{ name: 'Eldritch Blast' }] },
      featureDetails: [invocationFeature],
      eldritchInvocationSelections: [{ key: 'eldritch-spear', spellName: 'Eldritch Blast' }],
    });

    // 30 ft per Warlock level at level 12 = +360 ft on a 120 ft base.
    expect(modsFor(data, 'Eldritch Blast')[0]).toMatchObject({
      kind: 'range',
      badge: '+360ft',
      detail: 'Range 120 ft → 480 ft (30 ft per Warlock level)',
    });
  });

  it('states the forced movement for Repelling Blast', () => {
    const data = character({
      level: 3,
      spellsByLevel: { 0: [{ name: 'Eldritch Blast' }] },
      featureDetails: [invocationFeature],
      eldritchInvocationSelections: [{ key: 'repelling-blast', spellName: 'Eldritch Blast' }],
    });

    expect(modsFor(data, 'Eldritch Blast')[0]).toMatchObject({
      kind: 'effect',
      badge: 'push',
      detail: 'Push a Large or smaller creature up to 10 ft straight away from you on a hit',
    });
  });

  it('orders stacked invocations damage → range → other', () => {
    const data = character({
      level: 12,
      attributes: { Charisma: 20 },
      spellsByLevel: { 0: [{ name: 'Eldritch Blast' }] },
      featureDetails: [invocationFeature],
      eldritchInvocationSelections: [
        { key: 'repelling-blast', spellName: 'Eldritch Blast' },
        { key: 'eldritch-spear', spellName: 'Eldritch Blast' },
        { key: 'agonizing-blast', spellName: 'Eldritch Blast' },
      ],
    });

    expect(badges(data, 'Eldritch Blast')).toEqual(['+5 dmg', '+360ft', 'push']);
  });

  it('falls back to the rule text for an invocation with no dedicated formatter', () => {
    const data = character({
      level: 5,
      spellsByLevel: { 0: [{ name: 'Eldritch Blast' }] },
      featureDetails: [invocationFeature],
      eldritchInvocationSelections: [{ key: 'devils-sight', spellName: 'Eldritch Blast' }],
    });

    expect(modsFor(data, 'Eldritch Blast')[0].badge).toBeNull();
    expect(modsFor(data, 'Eldritch Blast')[0].detail).toBe(DEVILS_SIGHT_DESC);
  });

  it('ignores selections with no cantrip pick and unknown option keys', () => {
    const data = character({
      level: 5,
      spellsByLevel: { 0: [{ name: 'Eldritch Blast' }] },
      featureDetails: [invocationFeature],
      eldritchInvocationSelections: [
        { key: 'agonizing-blast', spellName: null },
        { key: 'not-in-this-pack', spellName: 'Eldritch Blast' },
      ],
    });

    expect(computeSpellModifiers({ data, resolveSpell }).size).toBe(0);
  });
});

describe('computeSpellModifiers — Potent Spellcasting', () => {
  const clericCantrips = { 0: [{ name: 'Sacred Flame' }, { name: 'Guidance' }] };

  it('adds the Wisdom modifier only to cantrips that actually deal damage', () => {
    const data = character({
      level: 7,
      attributes: { Wisdom: 16 },
      spellsByLevel: clericCantrips,
      raceTraitSelections: { 'Blessed Strikes': 'potent-spellcasting' },
    });

    expect(modsFor(data, 'Sacred Flame')[0]).toMatchObject({
      featureName: 'Potent Spellcasting',
      sourceLabel: 'Blessed Strikes',
      badge: '+3 dmg',
    });
    // Guidance rolls 1d4 with no damage type, so it is not a damage cantrip.
    expect(modsFor(data, 'Guidance')).toHaveLength(0);
  });

  it('is absent when the other Blessed Strikes option is chosen', () => {
    const data = character({
      level: 7,
      attributes: { Wisdom: 16 },
      spellsByLevel: clericCantrips,
      raceTraitSelections: { 'Blessed Strikes': 'divine-strike' },
    });

    expect(computeSpellModifiers({ data, resolveSpell }).size).toBe(0);
  });

  it('stacks Improved Elemental Fury range on top of the Druid damage bonus', () => {
    const data = character({
      level: 18,
      attributes: { Wisdom: 20 },
      spellsByLevel: clericCantrips,
      raceTraitSelections: { 'Elemental Fury': 'potent-spellcasting' },
      featureDetails: [feature('Improved Elemental Fury', { source: 'class' })],
    });

    expect(badges(data, 'Sacred Flame')).toEqual(['+5 dmg', '+300ft']);
    // Guidance has a Touch range, so the 10+ ft requirement excludes it.
    expect(modsFor(data, 'Guidance')).toHaveLength(0);
  });
});

describe('computeSpellModifiers — Draconic Sorcery', () => {
  it('applies Elemental Affinity only to spells of the CHOSEN damage type', () => {
    const data = character({
      level: 6,
      subclass: 'Draconic Sorcery',
      attributes: { Charisma: 18 },
      spellsByLevel: { 0: [{ name: 'Fire Bolt' }], 3: [{ name: 'Fireball' }] },
      featureDetails: [feature('Elemental Affinity')],
      raceTraitSelections: { 'Elemental Affinity': 'fire' },
    });

    expect(modsFor(data, 'Fireball')[0]).toMatchObject({
      featureName: 'Elemental Affinity',
      sourceLabel: 'Draconic Sorcery',
      kind: 'damage',
      badge: '+4 dmg',
    });
    expect(names(data, 'Fire Bolt')).toContain('Elemental Affinity');
  });

  it('leaves other damage types untouched when a different type is chosen', () => {
    const data = character({
      level: 6,
      attributes: { Charisma: 18 },
      spellsByLevel: { 3: [{ name: 'Fireball' }] },
      featureDetails: [feature('Elemental Affinity')],
      raceTraitSelections: { 'Elemental Affinity': 'cold' },
    });

    expect(modsFor(data, 'Fireball')).toHaveLength(0);
  });

  it('emits nothing while the damage type is still unchosen', () => {
    const data = character({
      level: 6,
      attributes: { Charisma: 18 },
      spellsByLevel: { 3: [{ name: 'Fireball' }] },
      featureDetails: [feature('Elemental Affinity')],
    });

    expect(computeSpellModifiers({ data, resolveSpell }).size).toBe(0);
  });
});

describe('computeSpellModifiers — Evoker', () => {
  it('stacks the three cantrip-level Evoker features on a damaging Evocation cantrip', () => {
    const data = character({
      level: 10,
      subclass: 'Evoker',
      attributes: { Intelligence: 20 },
      spellsByLevel: { 0: [{ name: 'Fire Bolt' }] },
      featureDetails: [
        feature('Potent Cantrip'),
        feature('Sculpt Spells'),
        feature('Empowered Evocation'),
      ],
    });

    expect(names(data, 'Fire Bolt')).toEqual([
      'Empowered Evocation',
      'Potent Cantrip',
      'Sculpt Spells',
    ]);
    expect(modsFor(data, 'Fire Bolt')[0].badge).toBe('+5 dmg');
  });

  it('limits Overchannel to spells of levels 1-5 that deal damage', () => {
    const data = character({
      level: 14,
      spellsByLevel: {
        0: [{ name: 'Fire Bolt' }],
        1: [{ name: 'Cure Wounds' }],
        3: [{ name: 'Fireball' }],
      },
      featureDetails: [feature('Overchannel')],
    });

    expect(names(data, 'Fireball')).toEqual(['Overchannel']);
    // A cantrip is not cast with a spell slot, and Cure Wounds deals no damage.
    expect(names(data, 'Fire Bolt')).not.toContain('Overchannel');
    expect(names(data, 'Cure Wounds')).not.toContain('Overchannel');
  });

  it('skips Empowered Evocation on non-Evocation spells', () => {
    const data = character({
      level: 10,
      attributes: { Intelligence: 20 },
      spellsByLevel: { 1: [{ name: 'Charm Person' }] },
      featureDetails: [feature('Empowered Evocation'), feature('Sculpt Spells')],
    });

    expect(modsFor(data, 'Charm Person')).toHaveLength(0);
  });
});

describe('computeSpellModifiers — Life Domain healing', () => {
  it('marks healing spells only, with all three tiers', () => {
    const data = character({
      level: 17,
      subclass: 'Life Domain',
      spellsByLevel: { 1: [{ name: 'Cure Wounds' }], 3: [{ name: 'Fireball' }] },
      featureDetails: [
        feature('Disciple of Life'),
        feature('Blessed Healer'),
        feature('Supreme Healing'),
      ],
    });

    expect(names(data, 'Cure Wounds')).toEqual([
      'Disciple of Life',
      'Blessed Healer',
      'Supreme Healing',
    ]);
    // Fireball deals damage and restores nothing.
    expect(modsFor(data, 'Fireball')).toHaveLength(0);
  });
});

describe('computeSpellModifiers — features that name one spell', () => {
  it("attaches Hunter's Mark features to the spell named in their own rule text", () => {
    const data = character({
      level: 17,
      subclass: 'Hunter',
      spellsByLevel: { 1: [{ name: "Hunter's Mark" }] },
      featureDetails: [
        feature("Hunter's Lore", {
          desc: "While a creature is marked by your *Hunter's Mark*, you know whether that creature has any Immunities.",
        }),
        feature("Superior Hunter's Prey", {
          desc: "Once per turn when you deal damage to a creature marked by your *Hunter's Mark*, you can also deal that spell's extra damage to a different creature.",
        }),
      ],
    });

    expect(names(data, "Hunter's Mark").sort()).toEqual([
      "Hunter's Lore",
      "Superior Hunter's Prey",
    ]);
  });

  it('emits nothing when the named spell is not on the sheet', () => {
    const data = character({
      level: 17,
      spellsByLevel: { 3: [{ name: 'Fireball' }] },
      featureDetails: [
        feature("Hunter's Lore", { desc: "marked by your *Hunter's Mark*, you know" }),
      ],
    });

    expect(computeSpellModifiers({ data, resolveSpell }).size).toBe(0);
  });
});

describe('computeSpellModifiers — cast without a spell slot', () => {
  it('marks the chosen Spell Mastery, Signature Spells and Mystic Arcanum picks', () => {
    const data = character({
      level: 20,
      spellsByLevel: { 1: [{ name: 'Charm Person' }], 3: [{ name: 'Fireball' }] },
      spellMasterySpellNamesByLevel: { 1: 'Charm Person' },
      signatureSpellsSpellNames: ['Fireball', null],
    });

    expect(names(data, 'Charm Person')).toContain('Spell Mastery');
    expect(
      modsFor(data, 'Charm Person').find((m) => m.featureName === 'Spell Mastery')?.badge
    ).toBe('at will');
    expect(names(data, 'Fireball')).toContain('Signature Spells');
  });
});

describe('computeSpellModifiers — Metamagic', () => {
  const metamagicFeature = feature('Metamagic', { source: 'class', options: METAMAGIC_OPTIONS });

  const sorcerer = (optionKeys: string[], spells: CharacterFormData['spellsByLevel']) =>
    character({
      level: 20,
      attributes: { Charisma: 20 },
      spellsByLevel: spells,
      featureDetails: [metamagicFeature],
      metamagicOptionKeys: optionKeys,
    });

  it('offers only the options the spell actually qualifies for', () => {
    const data = sorcerer(
      ['quickened-spell', 'seeking-spell', 'transmuted-spell', 'twinned-spell'],
      { 3: [{ name: 'Fireball' }] }
    );

    // Fireball: action casting time (Quickened) and Fire damage (Transmuted), but no attack roll
    // (Seeking) and no "one additional creature" higher-level text (Twinned).
    expect(names(data, 'Fireball').sort()).toEqual(['Quickened Spell', 'Transmuted Spell']);
  });

  it('gates Twinned Spell on the higher-level text that allows an extra target', () => {
    const data = sorcerer(['twinned-spell'], { 1: [{ name: 'Charm Person' }] });
    expect(names(data, 'Charm Person')).toEqual(['Twinned Spell']);
  });

  it('gates Seeking Spell on the spell having an attack roll', () => {
    const data = sorcerer(['seeking-spell'], {
      0: [{ name: 'Fire Bolt' }],
      3: [{ name: 'Fireball' }],
    });
    expect(names(data, 'Fire Bolt')).toEqual(['Seeking Spell']);
    expect(names(data, 'Fireball')).toHaveLength(0);
  });

  it('resolves Charisma-scaled numbers and records the Sorcery Point cost', () => {
    const data = sorcerer(['empowered-spell', 'careful-spell'], { 3: [{ name: 'Fireball' }] });
    const empowered = modsFor(data, 'Fireball').find((m) => m.featureName === 'Empowered Spell');

    expect(empowered).toMatchObject({
      sourceLabel: 'Metamagic',
      badge: 'reroll',
      cost: '1 Sorcery Point',
      detail: 'Reroll up to 5 damage dice (Charisma modifier, min 1)',
    });
    expect(modsFor(data, 'Fireball').find((m) => m.featureName === 'Careful Spell')?.cost).toBe(
      '1 Sorcery Point'
    );
  });

  it('ignores options the character did not choose', () => {
    const data = sorcerer(['careful-spell'], { 3: [{ name: 'Fireball' }] });
    expect(names(data, 'Fireball')).toEqual(['Careful Spell']);
  });

  it('can stack past the row badge limit, which is what forces the collapsed counter', () => {
    const data = character({
      level: 20,
      subclass: 'Draconic Sorcery',
      attributes: { Charisma: 20 },
      spellsByLevel: { 3: [{ name: 'Fireball' }] },
      featureDetails: [metamagicFeature, feature('Elemental Affinity')],
      raceTraitSelections: { 'Elemental Affinity': 'fire' },
      metamagicOptionKeys: [
        'careful-spell',
        'distant-spell',
        'empowered-spell',
        'quickened-spell',
        'transmuted-spell',
      ],
    });

    expect(modsFor(data, 'Fireball').length).toBeGreaterThan(3);
  });
});

// Free-cast texts copied verbatim from the ingested rows. The first sweep missed this whole family
// because its regex required "without expending a spell slot" and the SRD also writes "without a
// spell slot" — hence the rule now matches the sentence and reuses it as the detail.
const FAITHFUL_STEED_DESC =
  'You can call on the aid of an otherworldly steed. You always have the *Find Steed* spell prepared. You can also cast the spell once without expending a spell slot, and you regain the ability to do so when you finish a Long Rest.';
const FAVORED_ENEMY_DESC =
  "You always have the *Hunter's Mark* spell prepared. You can cast it twice without expending a spell slot, and you regain all expended uses of this ability when you finish a Long Rest.";
const ELVEN_LINEAGE_DESC =
  'You are part of a lineage that grants you supernatural abilities. You gain the Prestidigitation cantrip. You also learn a spell when you reach a level. You can cast it once without a spell slot, and you regain the ability to cast it in that way when you finish a Long Rest.';
const ARMOR_OF_SHADOWS_DESC =
  'You can cast *Mage Armor* on yourself without expending a spell slot.';

describe('computeSpellModifiers — cast without a slot, from the feature text', () => {
  it("marks Magic Initiate's level 1 pick but never its cantrips", () => {
    const data = character({
      level: 4,
      spellsByLevel: {
        0: [{ name: 'Fire Bolt', granted: true, grantSource: 'Magic Initiate' }],
        1: [{ name: 'Charm Person', granted: true, grantSource: 'Magic Initiate' }],
      },
      magicInitiateChoicesByGain: [
        {
          spellList: 'Wizard',
          cantripNames: ['Fire Bolt'],
          spellName: 'Charm Person',
          spellcastingAbility: 'Intelligence',
        },
      ],
    });

    expect(modsFor(data, 'Charm Person')[0]).toMatchObject({
      featureName: 'Magic Initiate',
      sourceLabel: 'Feat',
      kind: 'casting',
      badge: 'free',
    });
    // Cantrips never cost a slot, so a free-cast badge there would say nothing.
    expect(names(data, 'Fire Bolt')).not.toContain('Magic Initiate');
  });

  it('marks a granted row whose source feature says it casts without a slot', () => {
    const data = character({
      level: 5,
      className: 'Paladin',
      spellsByLevel: {
        1: [{ name: 'Charm Person', granted: true, grantSource: 'Faithful Steed' }],
      },
      featureDetails: [feature('Faithful Steed', { source: 'class', desc: FAITHFUL_STEED_DESC })],
    });

    expect(modsFor(data, 'Charm Person')[0]).toMatchObject({
      featureName: 'Faithful Steed',
      sourceLabel: 'Paladin',
      badge: 'free',
      detail:
        'You can also cast the spell once without expending a spell slot, and you regain the ability to do so when you finish a Long Rest.',
    });
  });

  it('keeps the SRD uses-per-rest wording instead of assuming "once"', () => {
    const data = character({
      level: 5,
      className: 'Ranger',
      spellsByLevel: {
        1: [{ name: "Hunter's Mark", granted: true, grantSource: 'Favored Enemy' }],
      },
      featureDetails: [feature('Favored Enemy', { source: 'class', desc: FAVORED_ENEMY_DESC })],
    });

    expect(modsFor(data, "Hunter's Mark")[0].detail).toContain(
      'twice without expending a spell slot'
    );
  });

  it('covers race lineages, and skips the cantrip they grant alongside', () => {
    const data = character({
      level: 5,
      race: 'Elf',
      spellsByLevel: {
        0: [{ name: 'Prestidigitation', granted: true, grantSource: 'Elven Lineage' }],
        1: [{ name: 'Charm Person', granted: true, grantSource: 'Elven Lineage' }],
      },
      featureDetails: [feature('Elven Lineage', { source: 'race', desc: ELVEN_LINEAGE_DESC })],
    });

    expect(modsFor(data, 'Charm Person')[0]).toMatchObject({
      featureName: 'Elven Lineage',
      sourceLabel: 'Elf',
      badge: 'free',
    });
    expect(modsFor(data, 'Prestidigitation')).toHaveLength(0);
  });

  it('covers invocations that grant a free-cast spell, reading the option text', () => {
    const data = character({
      level: 5,
      spellsByLevel: {
        1: [{ name: 'Charm Person', granted: true, grantSource: 'Armor of Shadows' }],
      },
      featureDetails: [
        feature('Eldritch Invocations', {
          source: 'class',
          options: [
            { key: 'armor-of-shadows', label: 'Armor of Shadows', desc: ARMOR_OF_SHADOWS_DESC },
          ],
        }),
      ],
    });

    expect(modsFor(data, 'Charm Person')[0]).toMatchObject({
      featureName: 'Armor of Shadows',
      sourceLabel: 'Eldritch Invocation',
      badge: 'free',
    });
  });

  it('leaves Spell Mastery as "at will" rather than the generic free badge', () => {
    const data = character({
      level: 18,
      spellsByLevel: { 1: [{ name: 'Charm Person', granted: true, grantSource: 'Spell Mastery' }] },
      spellMasterySpellNamesByLevel: { 1: 'Charm Person' },
      featureDetails: [
        feature('Spell Mastery', {
          source: 'class',
          desc: 'Choose a level 1 and a level 2 spell in your spellbook. You can cast them at their lowest level without expending a spell slot.',
        }),
      ],
    });

    const mods = modsFor(data, 'Charm Person').filter((m) => m.featureName === 'Spell Mastery');
    expect(mods).toHaveLength(1);
    expect(mods[0].badge).toBe('at will');
  });
});
